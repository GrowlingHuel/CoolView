#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
#[link(name = "X11")]
extern "C" {
    fn XInitThreads() -> i32;
}

fn main() {
    // XInitThreads must be called before any X11/GTK operations on Linux.
    // Without this, multi-threaded X11 access causes xcb_xlib_threads_sequence_lost
    // assertion failures and BadImplementation crashes when creating windows.
    #[cfg(target_os = "linux")]
    unsafe {
        XInitThreads();
    }

    coolview_lib::run();
}
