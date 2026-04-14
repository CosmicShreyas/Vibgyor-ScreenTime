//! Screenshot capture module
//!
//! This module handles desktop screenshot capture with multi-monitor support.
//! It captures the full desktop, compresses to JPEG format, and encodes to base64
//! for transmission to the server.
//!
//! Requirements: REQ-4.1, REQ-4.2, REQ-4.3, REQ-4.4, REQ-4.5

use crate::modules::error::MonitoringError;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::{ImageBuffer, Rgb};
use parking_lot::RwLock;
use screenshots::Screen;
use std::io::Cursor;
use std::sync::Arc;
use tracing::{debug, error, info, warn};

/// Default JPEG quality (1-100)
const DEFAULT_JPEG_QUALITY: u8 = 75;

/// Screenshot capture handler
///
/// Captures full desktop screenshots including all monitors,
/// compresses to JPEG format, and encodes to base64.
pub struct ScreenshotCapture {
    jpeg_quality: u8,
    // Reusable buffer for compression to reduce allocations
    buffer: Arc<RwLock<Vec<u8>>>,
}

impl ScreenshotCapture {
    /// Create a new screenshot capture instance
    ///
    /// # Arguments
    ///
    /// * `jpeg_quality` - JPEG compression quality (1-100). If None, uses default (75).
    ///
    /// # Returns
    ///
    /// A new ScreenshotCapture instance
    ///
    /// # Requirements
    ///
    /// REQ-4.3: Configurable JPEG quality (1-100, default: 75)
    pub fn new(jpeg_quality: Option<u8>) -> Self {
        let quality = match jpeg_quality {
            Some(q) if q >= 1 && q <= 100 => q,
            Some(q) => {
                warn!(
                    "Invalid JPEG quality {}, using default {}",
                    q, DEFAULT_JPEG_QUALITY
                );
                DEFAULT_JPEG_QUALITY
            }
            None => DEFAULT_JPEG_QUALITY,
        };

        info!("ScreenshotCapture initialized with quality: {}", quality);

        Self {
            jpeg_quality: quality,
            buffer: Arc::new(RwLock::new(Vec::with_capacity(1024 * 1024))), // 1MB initial capacity
        }
    }

    /// Capture a screenshot of the full desktop including all monitors
    ///
    /// # Returns
    ///
    /// Base64-encoded JPEG image data, or error if capture fails
    ///
    /// # Requirements
    ///
    /// - REQ-4.1: Capture full desktop screenshots including all monitors
    /// - REQ-4.2: Compress screenshots to JPEG format
    /// - REQ-4.4: Base64 encode screenshot data for transmission
    pub fn capture_screenshot(&self) -> Result<String, MonitoringError> {
        // Get all screens
        let screens = Screen::all().map_err(|e| {
            error!("Failed to enumerate screens: {}", e);
            MonitoringError::Screenshot(format!("Failed to enumerate screens: {}", e))
        })?;

        if screens.is_empty() {
            error!("No screens found");
            return Err(MonitoringError::Screenshot("No screens found".to_string()));
        }

        debug!("Found {} screen(s)", screens.len());

        // Capture all screens and combine them
        let combined_image = if screens.len() == 1 {
            // Single monitor - capture directly
            self.capture_single_screen(&screens[0])?
        } else {
            // Multiple monitors - capture and combine
            self.capture_multiple_screens(&screens)?
        };

        // Compress to JPEG
        let jpeg_data = self.compress_to_jpeg(&combined_image)?;

        // Encode to base64
        let base64_data = BASE64.encode(&jpeg_data);

        debug!(
            "Screenshot captured: {}x{}, compressed size: {} bytes, base64 size: {} bytes",
            combined_image.width(),
            combined_image.height(),
            jpeg_data.len(),
            base64_data.len()
        );

        Ok(base64_data)
    }

    /// Capture a single screen
    fn capture_single_screen(
        &self,
        screen: &Screen,
    ) -> Result<ImageBuffer<Rgb<u8>, Vec<u8>>, MonitoringError> {
        let image = screen.capture().map_err(|e| {
            error!("Failed to capture screen: {}", e);
            MonitoringError::Screenshot(format!("Failed to capture screen: {}", e))
        })?;

        // Convert RGBA to RGB8 format
        let width = image.width();
        let height = image.height();
        let rgba_data = image.rgba();
        
        // Convert RGBA to RGB by dropping alpha channel
        let mut rgb_data = Vec::with_capacity((width * height * 3) as usize);
        for chunk in rgba_data.chunks(4) {
            if chunk.len() >= 3 {
                rgb_data.push(chunk[0]); // R
                rgb_data.push(chunk[1]); // G
                rgb_data.push(chunk[2]); // B
            }
        }

        let rgb_image = ImageBuffer::from_raw(width, height, rgb_data)
            .ok_or_else(|| {
                error!("Failed to create image buffer");
                MonitoringError::Screenshot("Failed to create image buffer".to_string())
            })?;

        Ok(rgb_image)
    }

    /// Capture multiple screens and combine them into a single image
    ///
    /// Arranges screens horizontally based on their positions
    fn capture_multiple_screens(
        &self,
        screens: &[Screen],
    ) -> Result<ImageBuffer<Rgb<u8>, Vec<u8>>, MonitoringError> {
        // Capture all screens
        let mut captures = Vec::new();
        for screen in screens {
            match screen.capture() {
                Ok(image) => captures.push((screen, image)),
                Err(e) => {
                    warn!("Failed to capture screen {}: {}", screen.display_info.id, e);
                    continue;
                }
            }
        }

        if captures.is_empty() {
            return Err(MonitoringError::Screenshot(
                "Failed to capture any screens".to_string(),
            ));
        }

        // Calculate bounding box for all screens
        let mut min_x = i32::MAX;
        let mut min_y = i32::MAX;
        let mut max_x = i32::MIN;
        let mut max_y = i32::MIN;

        for (screen, _) in &captures {
            let info = &screen.display_info;
            min_x = min_x.min(info.x);
            min_y = min_y.min(info.y);
            max_x = max_x.max(info.x + info.width as i32);
            max_y = max_y.max(info.y + info.height as i32);
        }

        let total_width = (max_x - min_x) as u32;
        let total_height = (max_y - min_y) as u32;

        debug!(
            "Combined screenshot dimensions: {}x{} (from {} screens)",
            total_width,
            total_height,
            captures.len()
        );

        // Create combined image buffer
        let mut combined = ImageBuffer::from_pixel(total_width, total_height, Rgb([0, 0, 0]));

        // Copy each screen to the combined image
        for (screen, image) in captures {
            let info = &screen.display_info;
            let offset_x = (info.x - min_x) as u32;
            let offset_y = (info.y - min_y) as u32;

            // Convert captured image to RGB
            let rgba_data = image.rgba();
            let width = image.width();
            let height = image.height();

            for y in 0..height {
                for x in 0..width {
                    let src_idx = ((y * width + x) * 4) as usize; // RGBA format
                    if src_idx + 2 < rgba_data.len() {
                        let pixel = Rgb([rgba_data[src_idx], rgba_data[src_idx + 1], rgba_data[src_idx + 2]]);
                        
                        let dest_x = offset_x + x;
                        let dest_y = offset_y + y;
                        
                        if dest_x < total_width && dest_y < total_height {
                            combined.put_pixel(dest_x, dest_y, pixel);
                        }
                    }
                }
            }
        }

        Ok(combined)
    }

    /// Compress image to JPEG format
    ///
    /// Uses the configured JPEG quality and reuses buffer for efficiency
    fn compress_to_jpeg(
        &self,
        image: &ImageBuffer<Rgb<u8>, Vec<u8>>,
    ) -> Result<Vec<u8>, MonitoringError> {
        // Reuse buffer for compression
        let mut buffer = self.buffer.write();
        buffer.clear();

        let mut cursor = Cursor::new(&mut *buffer);

        // Create JPEG encoder with quality setting
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut cursor,
            self.jpeg_quality,
        );

        // Encode the image
        encoder
            .encode(
                image.as_raw(),
                image.width(),
                image.height(),
                image::ColorType::Rgb8,
            )
            .map_err(|e| {
                error!("Failed to encode JPEG: {}", e);
                MonitoringError::Screenshot(format!("Failed to encode JPEG: {}", e))
            })?;

        // Return a copy of the compressed data
        Ok(buffer.clone())
    }

    /// Get the configured JPEG quality
    pub fn get_quality(&self) -> u8 {
        self.jpeg_quality
    }

    /// Update the JPEG quality setting
    ///
    /// # Arguments
    ///
    /// * `quality` - New JPEG quality (1-100)
    ///
    /// # Returns
    ///
    /// Ok if quality is valid, Err otherwise
    pub fn set_quality(&mut self, quality: u8) -> Result<(), MonitoringError> {
        if quality < 1 || quality > 100 {
            return Err(MonitoringError::Config(format!(
                "Invalid JPEG quality: {}. Must be between 1 and 100",
                quality
            )));
        }

        self.jpeg_quality = quality;
        info!("JPEG quality updated to: {}", quality);
        Ok(())
    }

    /// Get the size of a base64-encoded screenshot in bytes
    ///
    /// # Arguments
    ///
    /// * `base64_data` - Base64-encoded image data
    ///
    /// # Returns
    ///
    /// Size in bytes of the decoded image data
    pub fn get_screenshot_size(base64_data: &str) -> Result<usize, MonitoringError> {
        let decoded = BASE64.decode(base64_data).map_err(|e| {
            error!("Failed to decode base64: {}", e);
            MonitoringError::Screenshot(format!("Failed to decode base64: {}", e))
        })?;

        Ok(decoded.len())
    }
}

impl Default for ScreenshotCapture {
    fn default() -> Self {
        Self::new(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_screenshot_capture_creation() {
        let capture = ScreenshotCapture::new(None);
        assert_eq!(capture.get_quality(), DEFAULT_JPEG_QUALITY);
    }

    #[test]
    fn test_screenshot_capture_with_quality() {
        let capture = ScreenshotCapture::new(Some(50));
        assert_eq!(capture.get_quality(), 50);
    }

    #[test]
    fn test_screenshot_capture_invalid_quality() {
        let capture = ScreenshotCapture::new(Some(150));
        assert_eq!(capture.get_quality(), DEFAULT_JPEG_QUALITY);
    }

    #[test]
    fn test_screenshot_capture_zero_quality() {
        let capture = ScreenshotCapture::new(Some(0));
        assert_eq!(capture.get_quality(), DEFAULT_JPEG_QUALITY);
    }

    #[test]
    fn test_set_quality() {
        let mut capture = ScreenshotCapture::new(None);
        assert!(capture.set_quality(90).is_ok());
        assert_eq!(capture.get_quality(), 90);
    }

    #[test]
    fn test_set_quality_invalid() {
        let mut capture = ScreenshotCapture::new(None);
        assert!(capture.set_quality(0).is_err());
        assert!(capture.set_quality(101).is_err());
        // Quality should remain unchanged
        assert_eq!(capture.get_quality(), DEFAULT_JPEG_QUALITY);
    }

    #[test]
    fn test_capture_screenshot_no_panic() {
        let capture = ScreenshotCapture::new(None);
        
        // This test verifies that capture doesn't panic
        // It may fail if no display is available (e.g., in CI)
        match capture.capture_screenshot() {
            Ok(base64_data) => {
                println!("Screenshot captured successfully");
                println!("Base64 length: {}", base64_data.len());
                
                // Verify it's valid base64
                assert!(!base64_data.is_empty());
                assert!(BASE64.decode(&base64_data).is_ok());
            }
            Err(e) => {
                println!("Screenshot capture failed (expected in headless environment): {}", e);
            }
        }
    }

    #[test]
    fn test_get_screenshot_size() {
        // Create a small test base64 string
        let test_data = b"Hello, World!";
        let base64_data = BASE64.encode(test_data);
        
        let size = ScreenshotCapture::get_screenshot_size(&base64_data).unwrap();
        assert_eq!(size, test_data.len());
    }

    #[test]
    fn test_get_screenshot_size_invalid() {
        let result = ScreenshotCapture::get_screenshot_size("invalid base64!!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_default() {
        let capture = ScreenshotCapture::default();
        assert_eq!(capture.get_quality(), DEFAULT_JPEG_QUALITY);
    }

    #[test]
    fn test_quality_bounds() {
        // Test minimum valid quality
        let capture = ScreenshotCapture::new(Some(1));
        assert_eq!(capture.get_quality(), 1);

        // Test maximum valid quality
        let capture = ScreenshotCapture::new(Some(100));
        assert_eq!(capture.get_quality(), 100);
    }

    #[test]
    fn test_buffer_reuse() {
        let capture = ScreenshotCapture::new(Some(75));
        
        // The buffer should be initialized
        let buffer = capture.buffer.read();
        assert_eq!(buffer.capacity(), 1024 * 1024); // 1MB initial capacity
    }
}
