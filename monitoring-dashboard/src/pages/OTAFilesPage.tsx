import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Upload, File, Trash2, ChevronRight, ChevronDown, CheckCircle, Clock, XCircle, Loader, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface FileTransfer {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  targetEmployees: string[];
  status: 'pending' | 'completed' | 'failed';
  employeeStatus: Array<{
    employeeName: string;
    status: 'pending' | 'downloading' | 'completed' | 'failed';
    downloadedAt?: string;
    error?: string;
  }>;
}

const OTAFilesPage: React.FC = () => {
  const { token } = useAuth();
  const [files, setFiles] = useState<FileTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ show: boolean; fileId: string; fileName: string }>({
    show: false,
    fileId: '',
    fileName: '',
  });
  const [showEmployeeSelector, setShowEmployeeSelector] = useState(false);
  const [employees, setEmployees] = useState<string[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    fetchFiles();
    fetchEmployees();
    const interval = setInterval(fetchFiles, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await api.get('/files', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFiles(response.data.files);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching files:', error);
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await api.get('/files/employees', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployees(response.data.employees || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast.error('Failed to fetch employees list');
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);
      // Open employee selector dialog
      setShowEmployeeSelector(true);
      setSelectedEmployees([]);
      setSelectAll(false);
    }
  };

  const handleEmployeeToggle = (employeeName: string) => {
    setSelectedEmployees(prev => {
      if (prev.includes(employeeName)) {
        const newSelection = prev.filter(e => e !== employeeName);
        setSelectAll(newSelection.length === employees.length);
        return newSelection;
      } else {
        const newSelection = [...prev, employeeName];
        setSelectAll(newSelection.length === employees.length);
        return newSelection;
      }
    });
  };

  const handleSelectAllToggle = () => {
    if (selectAll) {
      setSelectedEmployees([]);
      setSelectAll(false);
    } else {
      setSelectedEmployees([...employees]);
      setSelectAll(true);
    }
  };

  const handleCancelSelection = () => {
    setShowEmployeeSelector(false);
    setSelectedFile(null);
    setSelectedEmployees([]);
    setSelectAll(false);
    // Reset file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleUploadWithTargets = async () => {
    if (!selectedFile) return;

    setShowEmployeeSelector(false);
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);
    
    // If "Select All" or no employees selected, send empty array (means all employees)
    const targets = selectAll || selectedEmployees.length === 0 ? [] : selectedEmployees;
    formData.append('targetEmployees', JSON.stringify(targets));

    try {
      await api.post('/files/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          setUploadProgress(progress);
        },
      });

      setSelectedFile(null);
      setUploadProgress(0);
      fetchFiles();
      toast.success('File uploaded successfully!');
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteClick = (fileId: string, fileName: string) => {
    setDeleteConfirmation({ show: true, fileId, fileName });
  };

  const handleDeleteConfirm = async () => {
    const { fileId } = deleteConfirmation;
    setDeleteConfirmation({ show: false, fileId: '', fileName: '' });

    try {
      await api.delete(`/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchFiles();
      toast.success('File deleted successfully!');
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error('Failed to delete file');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmation({ show: false, fileId: '', fileName: '' });
  };

  const toggleRow = (fileId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(fileId)) {
      newExpanded.delete(fileId);
    } else {
      newExpanded.add(fileId);
    }
    setExpandedRows(newExpanded);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'downloading':
        return <Loader className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'downloading':
        return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
      case 'failed':
        return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800';
    }
  };

  const getOverallProgress = (file: FileTransfer): number => {
    const completed = file.employeeStatus.filter(
      (es) => es.status === 'completed'
    ).length;
    return file.employeeStatus.length > 0
      ? Math.round((completed / file.employeeStatus.length) * 100)
      : 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 text-gray-400 dark:text-gray-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          OTA File Transfer
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Upload files to distribute to all employee computers
        </p>
      </div>

      {/* Upload Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg card-shadow-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <Upload className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upload New File</h2>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="flex-1">
            <label className="block">
              <input
                type="file"
                onChange={handleFileSelect}
                disabled={uploading}
                className="block w-full text-sm text-gray-900 dark:text-gray-100
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-gray-100 dark:file:bg-gray-800
                  file:text-gray-700 dark:file:text-gray-300
                  hover:file:bg-gray-200 dark:hover:file:bg-gray-700
                  file:cursor-pointer
                  cursor-pointer
                  border border-gray-300 dark:border-gray-700 rounded-lg
                  bg-white dark:bg-gray-800
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>
            {selectedFile && !showEmployeeSelector && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            )}
          </div>
          {uploading && (
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <Loader className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Uploading...</span>
            </div>
          )}
        </div>
        {uploading && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div
                className="bg-gray-900 dark:bg-white h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{uploadProgress}%</p>
          </div>
        )}
      </div>

      {/* Files List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg card-shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Filename
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Uploaded
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-800">
              {files.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <File className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400">No files uploaded yet</p>
                  </td>
                </tr>
              ) : (
                files.map((file) => (
                  <React.Fragment key={file.id}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleRow(file.id)}
                            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          >
                            {expandedRows.has(file.id) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          <File className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {file.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatFileSize(file.fileSize)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(file.uploadedAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-gray-900 dark:bg-white h-2 rounded-full transition-all duration-300"
                              style={{ width: `${getOverallProgress(file)}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem]">
                            {getOverallProgress(file)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 inline-flex items-center gap-1.5 text-xs font-semibold rounded-full ${getStatusColor(
                            file.status
                          )}`}
                        >
                          {getStatusIcon(file.status)}
                          {file.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDeleteClick(file.id, file.filename)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 
                            transition-colors inline-flex items-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </td>
                    </tr>
                    {expandedRows.has(file.id) && (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50">
                          <div className="text-sm">
                            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                              Employee Status ({file.employeeStatus.length} employees)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {file.employeeStatus.map((es) => (
                                <div
                                  key={es.employeeName}
                                  className="flex items-center justify-between p-3 
                                    bg-white dark:bg-gray-800 rounded-lg border 
                                    border-gray-200 dark:border-gray-700 shadow-sm"
                                >
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {es.employeeName}
                                  </span>
                                  <span
                                    className={`px-2 py-1 text-xs font-semibold rounded-full inline-flex items-center gap-1 ${getStatusColor(
                                      es.status
                                    )}`}
                                  >
                                    {getStatusIcon(es.status)}
                                    {es.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Selection Dialog */}
      {showEmployeeSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-700">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Select Target Employees
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Choose which employees should receive this file
              </p>
              {selectedFile && (
                <p className="text-sm text-gray-900 dark:text-white mt-2 font-medium">
                  File: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
            </div>

            {/* Employee List */}
            <div className="flex-1 overflow-y-auto p-6">
              {employees.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No employees found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Select All Checkbox */}
                  <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors border-2 border-gray-200 dark:border-gray-600">
                    <button
                      type="button"
                      onClick={handleSelectAllToggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        selectAll ? 'bg-gray-900 dark:bg-white' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-900 transition-transform ${
                          selectAll ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <div className="flex-1">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        Select All Employees
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Send file to all employees
                      </p>
                    </div>
                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      {employees.length} total
                    </span>
                  </label>

                  <div className="my-4 border-t border-gray-200 dark:border-gray-700"></div>

                  {/* Individual Employee Checkboxes */}
                  {employees.map((employee) => (
                    <label
                      key={employee}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => handleEmployeeToggle(employee)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          selectedEmployees.includes(employee) ? 'bg-gray-900 dark:bg-white' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-900 transition-transform ${
                            selectedEmployees.includes(employee) ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                              {employee.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-gray-900 dark:text-white font-medium">
                            {employee}
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectAll ? (
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      All employees selected
                    </span>
                  ) : selectedEmployees.length === 0 ? (
                    <span className="text-yellow-600 dark:text-yellow-400">
                      No employees selected (will send to all)
                    </span>
                  ) : (
                    <span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {selectedEmployees.length}
                      </span>{' '}
                      employee{selectedEmployees.length !== 1 ? 's' : ''} selected
                    </span>
                  )}
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCancelSelection}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg 
                           text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 
                           transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadWithTargets}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg 
                           transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmation.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Delete File
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-1">
                  Are you sure you want to delete this file?
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {deleteConfirmation.fileName}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleDeleteCancel}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 
                         transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg 
                         transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OTAFilesPage;
