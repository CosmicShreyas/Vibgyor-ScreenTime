//! System Tray Module
//!
//! Provides system tray icon and menu for the monitoring client

use crate::modules::error::Result;
use std::sync::Arc;
use std::sync::mpsc::{channel, Receiver, Sender};
use parking_lot::RwLock;
use tracing::{info, error};

#[cfg(target_os = "windows")]
use trayicon::{MenuBuilder, TrayIconBuilder, Icon};

#[cfg(target_os = "windows")]
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum Events {
    ClickTrayIcon,
    Settings,
    About,
    Pause,
    Resume,
}

/// System tray state
pub struct SystemTray {
    #[cfg(target_os = "windows")]
    event_rx: Arc<RwLock<Receiver<Events>>>,
    
    /// Callback for settings menu click
    pub on_settings_click: Arc<RwLock<Option<Box<dyn Fn() + Send + Sync>>>>,
    
    /// Callback for about menu click
    pub on_about_click: Arc<RwLock<Option<Box<dyn Fn() + Send + Sync>>>>,
    
    /// Callback for pause menu click
    pub on_pause_click: Arc<RwLock<Option<Box<dyn Fn() + Send + Sync>>>>,
    
    /// Callback for resume menu click
    pub on_resume_click: Arc<RwLock<Option<Box<dyn Fn() + Send + Sync>>>>,
    
    /// Paused state
    pub is_paused: Arc<RwLock<bool>>,
}

impl SystemTray {
    /// Create new system tray
    #[cfg(target_os = "windows")]
    pub fn new() -> Result<Self> {
        info!("🔧 Initializing system tray...");
        
        let (event_tx, event_rx): (Sender<Events>, Receiver<Events>) = channel();
        
        // Create tray icon in a separate thread
        std::thread::spawn(move || {
            // Create icon data and leak it to get 'static lifetime
            let icon_data = Self::create_icon_data();
            let icon_data_static: &'static [u8] = Box::leak(icon_data.into_boxed_slice());
            
            let icon = Icon::from_buffer(icon_data_static, Some(16), Some(16))
                .expect("Failed to create tray icon");
            
            // Build menu with right-click context menu
            let menu = MenuBuilder::new()
                .item("⚙️ Settings", Events::Settings)
                .item("ℹ️ About", Events::About)
                .separator()
                .item("⏸️ Pause Monitoring", Events::Pause)
                .item("▶️ Resume Monitoring", Events::Resume);
            
            let _tray_icon = TrayIconBuilder::new()
                .sender(move |e: &Events| {
                    let _ = event_tx.send(*e);
                })
                .icon(icon)
                .tooltip("VibgyorSeek Monitoring")
                .menu(menu)
                .build()
                .expect("Failed to create tray icon");
            
            info!("✅ System tray icon created with context menu");
            
            // Keep the thread alive to maintain the tray icon
            // Process Windows messages to keep tray responsive
            #[cfg(target_os = "windows")]
            unsafe {
                use winapi::um::winuser::{GetMessageW, TranslateMessage, DispatchMessageW, MSG};
                let mut msg: MSG = std::mem::zeroed();
                loop {
                    let result = GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0);
                    if result > 0 {
                        TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    } else {
                        break;
                    }
                }
            }
        });
        
        // Give the tray icon thread time to initialize
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        info!("✅ System tray initialized");
        
        Ok(Self {
            event_rx: Arc::new(RwLock::new(event_rx)),
            on_settings_click: Arc::new(RwLock::new(None)),
            on_about_click: Arc::new(RwLock::new(None)),
            on_pause_click: Arc::new(RwLock::new(None)),
            on_resume_click: Arc::new(RwLock::new(None)),
            is_paused: Arc::new(RwLock::new(false)),
        })
    }
    
    #[cfg(not(target_os = "windows"))]
    pub fn new() -> Result<Self> {
        Ok(Self {
            on_settings_click: Arc::new(RwLock::new(None)),
            on_about_click: Arc::new(RwLock::new(None)),
            on_pause_click: Arc::new(RwLock::new(None)),
            on_resume_click: Arc::new(RwLock::new(None)),
            is_paused: Arc::new(RwLock::new(false)),
        })
    }
    
    /// Set callback for settings menu click
    pub fn set_on_settings_click<F>(&self, callback: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        *self.on_settings_click.write() = Some(Box::new(callback));
    }
    
    /// Set callback for about menu click
    pub fn set_on_about_click<F>(&self, callback: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        *self.on_about_click.write() = Some(Box::new(callback));
    }
    
    /// Set callback for pause menu click
    pub fn set_on_pause_click<F>(&self, callback: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        *self.on_pause_click.write() = Some(Box::new(callback));
    }
    
    /// Set callback for resume menu click
    pub fn set_on_resume_click<F>(&self, callback: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        *self.on_resume_click.write() = Some(Box::new(callback));
    }
    
    /// Check if monitoring is paused
    pub fn is_paused(&self) -> bool {
        *self.is_paused.read()
    }
    
    /// Set paused state
    pub fn set_paused(&self, paused: bool) {
        *self.is_paused.write() = paused;
    }
    
    /// Process menu events
    #[cfg(target_os = "windows")]
    pub fn process_events(&self) {
        let rx = self.event_rx.read();
        
        // Process all pending events
        while let Ok(event) = rx.try_recv() {
            info!("📋 Tray event received: {:?}", event);
            
            match event {
                Events::Settings => {
                    info!("⚙️ Settings menu clicked");
                    if let Some(callback) = self.on_settings_click.read().as_ref() {
                        callback();
                    }
                }
                Events::About => {
                    info!("ℹ️ About menu clicked");
                    if let Some(callback) = self.on_about_click.read().as_ref() {
                        callback();
                    }
                }
                Events::Pause => {
                    let is_paused = *self.is_paused.read();
                    if !is_paused {
                        info!("⏸️ Pause menu clicked");
                        *self.is_paused.write() = true;
                        if let Some(callback) = self.on_pause_click.read().as_ref() {
                            callback();
                        }
                    } else {
                        info!("⏸️ Pause clicked but already paused");
                    }
                }
                Events::Resume => {
                    let is_paused = *self.is_paused.read();
                    if is_paused {
                        info!("▶️ Resume menu clicked");
                        *self.is_paused.write() = false;
                        if let Some(callback) = self.on_resume_click.read().as_ref() {
                            callback();
                        }
                    } else {
                        info!("▶️ Resume clicked but not paused");
                    }
                }
                Events::ClickTrayIcon => {
                    info!("🖱️ Tray icon clicked");
                }
            }
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    pub fn process_events(&self) {
        // No-op on non-Windows platforms
    }
    
    /// Create icon data (simple 16x16 blue square with white "V")
    #[cfg(target_os = "windows")]
    fn create_icon_data() -> Vec<u8> {
        // Create a simple ICO file format
        // ICO header
        let mut data = vec![
            0, 0,  // Reserved
            1, 0,  // Type (1 = ICO)
            1, 0,  // Number of images
        ];
        
        // Image directory entry
        data.extend_from_slice(&[
            16,    // Width
            16,    // Height
            0,     // Color count (0 = no palette)
            0,     // Reserved
            1, 0,  // Color planes
            32, 0, // Bits per pixel
        ]);
        
        // Size of image data (will be filled later)
        let size_offset = data.len();
        data.extend_from_slice(&[0, 0, 0, 0]);
        
        // Offset to image data
        let offset: u32 = 22; // Header (6) + Directory entry (16)
        data.extend_from_slice(&offset.to_le_bytes());
        
        // DIB header (BITMAPINFOHEADER)
        let dib_start = data.len();
        data.extend_from_slice(&[
            40, 0, 0, 0,  // Header size
            16, 0, 0, 0,  // Width
            32, 0, 0, 0,  // Height (doubled for AND mask)
            1, 0,         // Planes
            32, 0,        // Bits per pixel
            0, 0, 0, 0,   // Compression (0 = none)
            0, 0, 0, 0,   // Image size (can be 0 for uncompressed)
            0, 0, 0, 0,   // X pixels per meter
            0, 0, 0, 0,   // Y pixels per meter
            0, 0, 0, 0,   // Colors used
            0, 0, 0, 0,   // Important colors
        ]);
        
        // Pixel data (BGRA format, bottom-up)
        let mut pixels = vec![0u8; 16 * 16 * 4];
        
        // Fill with blue background
        for y in 0..16 {
            for x in 0..16 {
                let idx = (y * 16 + x) * 4;
                pixels[idx] = 185;     // B
                pixels[idx + 1] = 128; // G
                pixels[idx + 2] = 41;  // R
                pixels[idx + 3] = 255; // A
            }
        }
        
        // Draw a simple "V" shape in white
        let v_pattern = [
            (4, 4), (5, 5), (6, 6), (7, 7), (8, 7), (9, 6), (10, 5), (11, 4),
            (4, 5), (5, 6), (6, 7), (7, 8), (8, 8), (9, 7), (10, 6), (11, 5),
        ];
        
        for (x, y) in v_pattern.iter() {
            if *x < 16 && *y < 16 {
                let idx = (y * 16 + x) * 4;
                pixels[idx] = 255;     // B
                pixels[idx + 1] = 255; // G
                pixels[idx + 2] = 255; // R
                pixels[idx + 3] = 255; // A
            }
        }
        
        // Reverse rows (BMP is bottom-up)
        let mut reversed_pixels = vec![0u8; 16 * 16 * 4];
        for y in 0..16 {
            let src_row = &pixels[y * 16 * 4..(y + 1) * 16 * 4];
            let dst_row = &mut reversed_pixels[(15 - y) * 16 * 4..(16 - y) * 16 * 4];
            dst_row.copy_from_slice(src_row);
        }
        
        data.extend_from_slice(&reversed_pixels);
        
        // AND mask (all transparent)
        let and_mask = vec![0u8; 16 * 4]; // 16 rows, 4 bytes each (32 pixels per row, 1 bit per pixel)
        data.extend_from_slice(&and_mask);
        
        // Update size in directory entry
        let image_size = (data.len() - dib_start) as u32;
        data[size_offset..size_offset + 4].copy_from_slice(&image_size.to_le_bytes());
        
        data
    }
}
