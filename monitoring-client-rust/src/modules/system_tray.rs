//! System Tray Module
//!
//! Provides system tray icon and menu for the monitoring client

use crate::modules::error::Result;
use parking_lot::RwLock;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use tracing::{error, info};

#[cfg(target_os = "windows")]
use trayicon::{Icon, TrayIconBuilder};

#[cfg(target_os = "windows")]
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum Events {
    ClickTrayIcon,
    ShowMenu,
    ViewStats,
    Settings,
    About,
    Pause,
    Resume,
    Stop,
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

    /// Callback for stop/quit menu click
    pub on_stop_click: Arc<RwLock<Option<Box<dyn Fn() + Send + Sync>>>>,

    /// Callback for "View your stats" menu click (opens the self-view page).
    pub on_view_stats_click: Arc<RwLock<Option<Box<dyn Fn() + Send + Sync>>>>,

    /// Callback invoked when the tray icon is clicked and a themed menu should
    /// be shown. Receives the current paused state and returns the chosen action
    /// id ("settings" | "about" | "pause" | "resume" | "stop"), or None.
    pub on_show_menu: Arc<RwLock<Option<Box<dyn Fn(bool) -> Option<String> + Send + Sync>>>>,

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

            let icon = Icon::from_buffer(icon_data_static, Some(32), Some(32))
                .expect("Failed to create tray icon");

            // No native Win32 menu — right-click raises ShowMenu, and we render
            // our own themed WPF popup (see GuiState::show_tray_menu) instead of
            // the old OS-drawn context menu. Left-click also opens it.
            let _tray_icon = TrayIconBuilder::new()
                .sender(move |e: &Events| {
                    let _ = event_tx.send(*e);
                })
                .icon(icon)
                .tooltip("ScreenTime Monitoring")
                .on_click(Events::ShowMenu)
                .on_right_click(Events::ShowMenu)
                .build()
                .expect("Failed to create tray icon");

            info!("✅ System tray icon created (themed popup menu)");

            // Keep the thread alive to maintain the tray icon
            // Process Windows messages to keep tray responsive
            #[cfg(target_os = "windows")]
            unsafe {
                use winapi::um::winuser::{DispatchMessageW, GetMessageW, TranslateMessage, MSG};
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
            on_stop_click: Arc::new(RwLock::new(None)),
            on_view_stats_click: Arc::new(RwLock::new(None)),
            on_show_menu: Arc::new(RwLock::new(None)),
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
            on_stop_click: Arc::new(RwLock::new(None)),
            on_view_stats_click: Arc::new(RwLock::new(None)),
            on_show_menu: Arc::new(RwLock::new(None)),
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

    /// Set callback for stop/quit menu click
    pub fn set_on_stop_click<F>(&self, callback: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        *self.on_stop_click.write() = Some(Box::new(callback));
    }

    /// Set callback for "View your stats" menu click
    pub fn set_on_view_stats_click<F>(&self, callback: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        *self.on_view_stats_click.write() = Some(Box::new(callback));
    }

    /// Set the callback that renders the themed tray menu. It is given the
    /// current paused state and returns the chosen action id (or None).
    pub fn set_on_show_menu<F>(&self, callback: F)
    where
        F: Fn(bool) -> Option<String> + Send + Sync + 'static,
    {
        *self.on_show_menu.write() = Some(Box::new(callback));
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
                Events::ShowMenu => {
                    // Render the themed popup and act on the chosen item. Doing
                    // the dispatch here keeps the paused-state bookkeeping in one
                    // place regardless of which entry was picked.
                    let is_paused = *self.is_paused.read();
                    let choice = self
                        .on_show_menu
                        .read()
                        .as_ref()
                        .and_then(|cb| cb(is_paused));
                    match choice.as_deref() {
                        Some("stats") => self.dispatch_view_stats(),
                        Some("settings") => self.dispatch_settings(),
                        Some("about") => self.dispatch_about(),
                        Some("pause") => self.dispatch_pause(),
                        Some("resume") => self.dispatch_resume(),
                        Some("stop") => self.dispatch_stop(),
                        _ => {}
                    }
                }
                Events::ViewStats => self.dispatch_view_stats(),
                Events::Settings => self.dispatch_settings(),
                Events::About => self.dispatch_about(),
                Events::Pause => self.dispatch_pause(),
                Events::Resume => self.dispatch_resume(),
                Events::Stop => self.dispatch_stop(),
                Events::ClickTrayIcon => {
                    info!("🖱️ Tray icon clicked");
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn dispatch_settings(&self) {
        info!("⚙️ Settings selected");
        if let Some(cb) = self.on_settings_click.read().as_ref() {
            cb();
        }
    }

    #[cfg(target_os = "windows")]
    fn dispatch_about(&self) {
        info!("ℹ️ About selected");
        if let Some(cb) = self.on_about_click.read().as_ref() {
            cb();
        }
    }

    #[cfg(target_os = "windows")]
    fn dispatch_pause(&self) {
        if *self.is_paused.read() {
            info!("⏸️ Pause selected but already paused");
            return;
        }
        info!("⏸️ Pause selected");
        *self.is_paused.write() = true;
        if let Some(cb) = self.on_pause_click.read().as_ref() {
            cb();
        }
    }

    #[cfg(target_os = "windows")]
    fn dispatch_resume(&self) {
        if !*self.is_paused.read() {
            info!("▶️ Resume selected but not paused");
            return;
        }
        info!("▶️ Resume selected");
        *self.is_paused.write() = false;
        if let Some(cb) = self.on_resume_click.read().as_ref() {
            cb();
        }
    }

    #[cfg(target_os = "windows")]
    fn dispatch_stop(&self) {
        info!("🛑 Stop selected");
        if let Some(cb) = self.on_stop_click.read().as_ref() {
            cb();
        }
    }

    #[cfg(target_os = "windows")]
    fn dispatch_view_stats(&self) {
        info!("📊 View-stats selected");
        if let Some(cb) = self.on_view_stats_click.read().as_ref() {
            cb();
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn process_events(&self) {
        // No-op on non-Windows platforms
    }

    /// The ScreenTime brand mark (the same radar/scan logo used as the
    /// dashboard favicon), rasterized to PNG. Embedded at compile time.
    #[cfg(target_os = "windows")]
    const BRAND_ICON_PNG: &'static [u8] = include_bytes!("../../assets/tray-icon.png");

    /// Build the tray icon (ICO bytes) from the embedded brand PNG.
    ///
    /// `trayicon`'s `Icon::from_buffer` expects ICO-format bytes (it calls
    /// `LookupIconIdFromDirectoryEx`), so we decode the PNG to RGBA, scale it to
    /// 32×32 (crisp on modern DPI), and wrap it in a single-image ICO with a
    /// 32bpp BGRA bitmap + a fully-opaque AND mask. Falls back to a solid brand
    /// tile if decoding ever fails so the tray never crashes.
    #[cfg(target_os = "windows")]
    fn create_icon_data() -> Vec<u8> {
        const DIM: u32 = 32;

        // Decode the embedded PNG → RGBA8, resized to DIM×DIM.
        let rgba: Vec<u8> = match image::load_from_memory(Self::BRAND_ICON_PNG) {
            Ok(img) => {
                let scaled = img.resize_exact(DIM, DIM, image::imageops::FilterType::Lanczos3);
                scaled.to_rgba8().into_raw()
            }
            Err(e) => {
                error!("Failed to decode tray icon PNG, using fallback: {}", e);
                // Fallback: solid brand-blue tile (RGBA).
                let mut px = vec![0u8; (DIM * DIM * 4) as usize];
                for chunk in px.chunks_exact_mut(4) {
                    chunk[0] = 0x4F; // R
                    chunk[1] = 0x6D; // G
                    chunk[2] = 0xF5; // B
                    chunk[3] = 0xFF; // A
                }
                px
            }
        };

        Self::rgba_to_ico(&rgba, DIM)
    }

    /// Wrap a top-down RGBA8 buffer of `dim`×`dim` into single-image ICO bytes.
    #[cfg(target_os = "windows")]
    fn rgba_to_ico(rgba: &[u8], dim: u32) -> Vec<u8> {
        let d = dim as usize;

        // ICONDIR header + one ICONDIRENTRY.
        let mut data = vec![
            0, 0, // Reserved
            1, 0, // Type (1 = icon)
            1, 0, // Image count
        ];
        data.push(if dim >= 256 { 0 } else { dim as u8 }); // Width (0 == 256)
        data.push(if dim >= 256 { 0 } else { dim as u8 }); // Height
        data.extend_from_slice(&[
            0, // Palette size
            0, // Reserved
            1, 0, // Color planes
            32, 0, // Bits per pixel
        ]);
        let size_offset = data.len();
        data.extend_from_slice(&[0, 0, 0, 0]); // Image byte size (filled below)
        data.extend_from_slice(&22u32.to_le_bytes()); // Offset to image (6 + 16)

        // BITMAPINFOHEADER — height is doubled to account for the AND mask.
        let dib_start = data.len();
        data.extend_from_slice(&40u32.to_le_bytes()); // Header size
        data.extend_from_slice(&(dim as i32).to_le_bytes()); // Width
        data.extend_from_slice(&((dim * 2) as i32).to_le_bytes()); // Height (XOR+AND)
        data.extend_from_slice(&1u16.to_le_bytes()); // Planes
        data.extend_from_slice(&32u16.to_le_bytes()); // Bits per pixel
        data.extend_from_slice(&[0u8; 24]); // compression + sizes + dpi + palette

        // XOR bitmap: BGRA, bottom-up.
        let mut bgra = vec![0u8; d * d * 4];
        for y in 0..d {
            for x in 0..d {
                let src = (y * d + x) * 4;
                let dst = ((d - 1 - y) * d + x) * 4; // flip vertically
                bgra[dst] = rgba[src + 2]; // B
                bgra[dst + 1] = rgba[src + 1]; // G
                bgra[dst + 2] = rgba[src]; // R
                bgra[dst + 3] = rgba[src + 3]; // A
            }
        }
        data.extend_from_slice(&bgra);

        // AND mask: 1 bit per pixel, rows padded to 32-bit. With a 32bpp image
        // Windows uses the alpha channel, so a zeroed mask (all "opaque") is fine.
        let row_bytes = (((dim + 31) / 32) * 4) as usize;
        data.extend_from_slice(&vec![0u8; row_bytes * d]);

        let image_size = (data.len() - dib_start) as u32;
        data[size_offset..size_offset + 4].copy_from_slice(&image_size.to_le_bytes());

        data
    }
}
