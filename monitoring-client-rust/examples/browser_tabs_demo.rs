//! Demo: Get browser tab names using windows-rs
//! 
//! This demonstrates how to enumerate all windows and extract browser tab titles
//! from Chrome, Edge, and Firefox.
//!
//! Run with: cargo run --example browser_tabs_demo

use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextW, GetClassNameW, IsWindowVisible,
};
use std::collections::HashMap;

/// Callback function for EnumWindows
unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let windows = &mut *(lparam.0 as *mut Vec<WindowInfo>);
    
    // Only process visible windows
    if IsWindowVisible(hwnd).as_bool() {
        // Get window title
        let mut title_buffer = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, &mut title_buffer);
        let title = String::from_utf16_lossy(&title_buffer[..title_len as usize]);
        
        // Get window class name
        let mut class_buffer = [0u16; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buffer);
        let class_name = String::from_utf16_lossy(&class_buffer[..class_len as usize]);
        
        // Only collect windows with titles
        if !title.is_empty() {
            windows.push(WindowInfo {
                hwnd,
                title,
                class_name,
            });
        }
    }
    
    BOOL::from(true) // Continue enumeration
}

#[derive(Debug, Clone)]
struct WindowInfo {
    hwnd: HWND,
    title: String,
    class_name: String,
}

#[derive(Debug)]
struct BrowserTab {
    browser: String,
    title: String,
}

fn get_all_windows() -> Vec<WindowInfo> {
    let mut windows = Vec::new();
    
    unsafe {
        let lparam = LPARAM(&mut windows as *mut _ as isize);
        let _ = EnumWindows(Some(enum_window_callback), lparam);
    }
    
    windows
}

fn extract_browser_tabs(windows: &[WindowInfo]) -> Vec<BrowserTab> {
    let mut tabs = Vec::new();
    
    for window in windows {
        // Check if this is a Chrome window
        if window.class_name == "Chrome_WidgetWin_1" {
            // Chrome/Edge windows have titles like: "Page Title - Google Chrome" or "Page Title - Microsoft Edge"
            if window.title.contains(" - Google Chrome") {
                let title = window.title.replace(" - Google Chrome", "").trim().to_string();
                if !title.is_empty() && title != "New Tab" {
                    tabs.push(BrowserTab {
                        browser: "Chrome".to_string(),
                        title,
                    });
                }
            } else if window.title.contains(" - Microsoft​ Edge") || window.title.contains(" - Microsoft Edge") {
                let title = window.title
                    .replace(" - Microsoft​ Edge", "")
                    .replace(" - Microsoft Edge", "")
                    .trim()
                    .to_string();
                if !title.is_empty() && title != "New Tab" && title != "New tab" {
                    tabs.push(BrowserTab {
                        browser: "Edge".to_string(),
                        title,
                    });
                }
            }
        }
        // Check if this is a Firefox window
        else if window.class_name == "MozillaWindowClass" {
            // Firefox windows have titles like: "Page Title - Mozilla Firefox"
            if window.title.contains(" - Mozilla Firefox") {
                let title = window.title.replace(" - Mozilla Firefox", "").trim().to_string();
                if !title.is_empty() && title != "New Tab" {
                    tabs.push(BrowserTab {
                        browser: "Firefox".to_string(),
                        title,
                    });
                }
            }
        }
    }
    
    tabs
}

fn main() {
    println!("🔍 Enumerating all windows...\n");
    
    let windows = get_all_windows();
    println!("Found {} total windows\n", windows.len());
    
    // Group windows by class name
    let mut by_class: HashMap<String, Vec<&WindowInfo>> = HashMap::new();
    for window in &windows {
        by_class.entry(window.class_name.clone())
            .or_insert_with(Vec::new)
            .push(window);
    }
    
    println!("📊 Windows by class:");
    for (class_name, wins) in &by_class {
        if !class_name.is_empty() {
            println!("  {} ({} windows)", class_name, wins.len());
        }
    }
    
    println!("\n🌐 Browser windows:");
    
    // Show Chrome windows
    if let Some(chrome_windows) = by_class.get("Chrome_WidgetWin_1") {
        println!("\n  Chrome/Edge windows ({}):", chrome_windows.len());
        for window in chrome_windows {
            println!("    - {}", window.title);
        }
    }
    
    // Show Firefox windows
    if let Some(firefox_windows) = by_class.get("MozillaWindowClass") {
        println!("\n  Firefox windows ({}):", firefox_windows.len());
        for window in firefox_windows {
            println!("    - {}", window.title);
        }
    }
    
    println!("\n📑 Extracted browser tabs:");
    let tabs = extract_browser_tabs(&windows);
    
    if tabs.is_empty() {
        println!("  No browser tabs found!");
    } else {
        for tab in &tabs {
            println!("  [{}] {}", tab.browser, tab.title);
        }
        println!("\n✅ Total: {} tabs", tabs.len());
    }
}
