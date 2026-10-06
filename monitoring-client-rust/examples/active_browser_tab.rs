//! Demo: Track the currently active browser tab
//! 
//! This monitors which browser tab is currently in the foreground.
//! It polls every second and shows when the active tab changes.
//!
//! Run with: cargo run --example active_browser_tab

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetClassNameW,
};
use std::thread;
use std::time::Duration;

fn get_active_window_info() -> Option<(String, String, String)> {
    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        
        if hwnd.0 == 0 {
            return None;
        }
        
        // Get window title
        let mut title_buffer = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, &mut title_buffer);
        let title = String::from_utf16_lossy(&title_buffer[..title_len as usize]);
        
        // Get window class name
        let mut class_buffer = [0u16; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buffer);
        let class_name = String::from_utf16_lossy(&class_buffer[..class_len as usize]);
        
        // Determine browser and extract tab title
        let (browser, tab_title) = if class_name == "Chrome_WidgetWin_1" {
            if title.contains(" - Google Chrome") {
                ("Chrome", title.replace(" - Google Chrome", ""))
            } else if title.contains(" - Microsoft​ Edge") {
                ("Edge", title.replace(" - Microsoft​ Edge", ""))
            } else if title.contains(" - Microsoft Edge") {
                ("Edge", title.replace(" - Microsoft Edge", ""))
            } else {
                ("Chrome/Edge", title.clone())
            }
        } else if class_name == "MozillaWindowClass" {
            if title.contains(" - Mozilla Firefox") {
                ("Firefox", title.replace(" - Mozilla Firefox", ""))
            } else {
                ("Firefox", title.clone())
            }
        } else {
            ("Other", title.clone())
        };
        
        Some((browser.to_string(), tab_title, class_name))
    }
}

fn main() {
    println!("🔍 Monitoring active browser tab...");
    println!("Press Ctrl+C to stop\n");
    
    let mut last_title = String::new();
    
    loop {
        if let Some((browser, tab_title, class_name)) = get_active_window_info() {
            // Only print if it's a browser and the title changed
            if (browser == "Chrome" || browser == "Edge" || browser == "Firefox" || browser == "Chrome/Edge") 
                && tab_title != last_title 
                && !tab_title.is_empty() {
                
                println!("🌐 [{}] {}", browser, tab_title);
                println!("   Class: {}", class_name);
                last_title = tab_title;
            }
        }
        
        thread::sleep(Duration::from_millis(500));
    }
}
