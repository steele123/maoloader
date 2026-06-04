use std::{
    ffi::c_void,
    sync::atomic::{AtomicBool, AtomicI64, AtomicIsize, AtomicUsize, Ordering},
};

#[cfg(windows)]
#[link(name = "user32")]
unsafe extern "system" {
    fn GetAncestor(hwnd: isize, flags: u32) -> isize;
    fn FindWindowExA(
        parent: isize,
        child_after: isize,
        class_name: *const u8,
        window_name: *const u8,
    ) -> isize;
    fn SetParent(child: isize, parent: isize) -> isize;
    fn ShowWindow(hwnd: isize, command: i32) -> i32;
    fn SetWindowPos(
        hwnd: isize,
        insert_after: isize,
        x: i32,
        y: i32,
        cx: i32,
        cy: i32,
        flags: u32,
    ) -> i32;
    fn GetWindowLongPtrW(hwnd: isize, index: i32) -> isize;
    fn SetWindowLongPtrW(hwnd: isize, index: i32, value: isize) -> isize;
    fn CallWindowProcW(
        proc: isize,
        hwnd: isize,
        message: u32,
        wparam: usize,
        lparam: isize,
    ) -> isize;
    fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, flags: u32) -> i32;
    fn SetPropA(hwnd: isize, name: *const u8, value: isize) -> i32;
    fn RemovePropA(hwnd: isize, name: *const u8) -> isize;
}

#[cfg(windows)]
#[link(name = "dwmapi")]
unsafe extern "system" {
    fn DwmSetWindowAttribute(hwnd: isize, attr: u32, value: *const c_void, size: u32) -> i32;
    fn DwmExtendFrameIntoClientArea(hwnd: isize, margins: *const Margins) -> i32;
}

#[cfg(windows)]
#[link(name = "ntdll")]
unsafe extern "system" {
    fn RtlGetVersion(version: *mut OsVersionInfoExW) -> i32;
}

#[cfg(windows)]
#[repr(C)]
struct OsVersionInfoExW {
    size: u32,
    major_version: u32,
    minor_version: u32,
    build_number: u32,
    platform_id: u32,
    csd_version: [u16; 128],
    service_pack_major: u16,
    service_pack_minor: u16,
    suite_mask: u16,
    product_type: u8,
    reserved: u8,
}

#[cfg(windows)]
#[repr(C)]
struct Margins {
    left_width: i32,
    right_width: i32,
    top_height: i32,
    bottom_height: i32,
}

#[cfg(windows)]
#[repr(C)]
struct AccentPolicy {
    state: u32,
    flags: u32,
    gradient_color: u32,
    animation_id: u32,
}

#[cfg(windows)]
#[repr(C)]
struct WindowCompositionAttribData {
    attrib: u32,
    data: *mut c_void,
    data_size: u32,
}

#[cfg(windows)]
#[repr(C)]
struct WindowPos {
    hwnd: isize,
    insert_after: isize,
    x: i32,
    y: i32,
    cx: i32,
    cy: i32,
    flags: u32,
}

#[repr(C)]
pub struct CefString {
    pub str_: *mut u16,
    pub length: usize,
    pub dtor: Option<unsafe extern "C" fn(*mut u16)>,
}

impl CefString {
    pub fn leaked(value: &str) -> Self {
        let mut data = value.encode_utf16().collect::<Vec<_>>();
        let length = data.len();
        let str_ = data.as_mut_ptr();
        std::mem::forget(data);

        Self {
            str_,
            length,
            dtor: None,
        }
    }
}

#[cfg(windows)]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

pub unsafe fn borrowed_cef_string(value: *const CefString) -> Option<String> {
    unsafe { cef_string_to_string(value) }
}

#[repr(C)]
pub struct CefBaseRefCounted {
    pub size: usize,
    pub add_ref: Option<unsafe extern "system" fn(*mut CefBaseRefCounted)>,
    pub release: Option<unsafe extern "system" fn(*mut CefBaseRefCounted) -> i32>,
    pub has_one_ref: Option<unsafe extern "system" fn(*mut CefBaseRefCounted) -> i32>,
    pub has_at_least_one_ref: Option<unsafe extern "system" fn(*mut CefBaseRefCounted) -> i32>,
}

pub type OnBeforeCommandLineProcessing = unsafe extern "system" fn(
    self_: *mut CefApp,
    process_type: *const CefString,
    command_line: *mut CefCommandLine,
);

pub type GetRenderProcessHandler =
    unsafe extern "system" fn(*mut CefApp) -> *mut CefRenderProcessHandler;
pub type OnBrowserCreated = unsafe extern "system" fn(
    *mut CefRenderProcessHandler,
    *mut c_void,
    *mut CefDictionaryValuePrefix,
);
pub type OnContextCreated = unsafe extern "system" fn(
    *mut CefRenderProcessHandler,
    *mut c_void,
    *mut CefFramePrefix,
    *mut c_void,
);
pub type V8Execute = unsafe extern "system" fn(
    *mut CefV8Handler,
    *const CefString,
    *mut CefV8Value,
    usize,
    *const *mut CefV8Value,
    *mut *mut CefV8Value,
    *mut CefString,
) -> i32;
pub type ClientOnProcessMessageReceived = unsafe extern "system" fn(
    *mut CefClientPrefix,
    *mut CefBrowserPrefix,
    *mut c_void,
    i32,
    *mut CefProcessMessagePrefix,
) -> i32;
pub type GetKeyboardHandler =
    unsafe extern "system" fn(*mut CefClientPrefix) -> *mut CefKeyboardHandlerPrefix;
pub type GetLifeSpanHandler =
    unsafe extern "system" fn(*mut CefClientPrefix) -> *mut CefLifeSpanHandlerPrefix;
pub type OnPreKeyEvent = unsafe extern "system" fn(
    *mut CefKeyboardHandlerPrefix,
    *mut CefBrowserPrefix,
    *const CefKeyEvent,
    *mut c_void,
    *mut i32,
) -> i32;
pub type OnAfterCreated =
    unsafe extern "system" fn(*mut CefLifeSpanHandlerPrefix, *mut CefBrowserPrefix);

static MAIN_WINDOW_HANDLE: AtomicIsize = AtomicIsize::new(0);
#[cfg(windows)]
static mut SILENT_SHOW_WINDOW_HOOK: Option<crate::hook::InlineHook> = None;
#[cfg(windows)]
static mut SILENT_SET_WINDOW_POS_HOOK: Option<crate::hook::InlineHook> = None;
#[cfg(windows)]
static ORIGINAL_WINDOW_PROC: AtomicIsize = AtomicIsize::new(0);

#[repr(C)]
pub struct CefRequestContextPrefix {
    pub base: CefBaseRefCounted,
    pub has_preference: *mut c_void,
    pub get_preference: *mut c_void,
    pub get_all_preferences: *mut c_void,
    pub can_set_preference: *mut c_void,
    pub set_preference: *mut c_void,
    pub is_same: *mut c_void,
    pub is_sharing_with: *mut c_void,
    pub is_global: *mut c_void,
    pub get_handler: *mut c_void,
    pub get_cache_path: *mut c_void,
    pub get_cookie_manager: *mut c_void,
    pub register_scheme_handler_factory: Option<
        unsafe extern "system" fn(
            self_: *mut CefRequestContextPrefix,
            scheme_name: *const CefString,
            domain_name: *const CefString,
            factory: *mut CefSchemeHandlerFactory,
        ) -> i32,
    >,
}

#[repr(C)]
pub struct CefSchemeHandlerFactory {
    pub base: CefBaseRefCounted,
    pub create: Option<
        unsafe extern "system" fn(
            self_: *mut CefSchemeHandlerFactory,
            browser: *mut c_void,
            frame: *mut c_void,
            scheme_name: *const CefString,
            request: *mut c_void,
        ) -> *mut c_void,
    >,
}

#[repr(C)]
pub struct CefRequestPrefix {
    pub base: CefBaseRefCounted,
    pub is_read_only: *mut c_void,
    pub get_url: Option<unsafe extern "system" fn(*mut CefRequestPrefix) -> *mut CefString>,
    pub set_url: Option<unsafe extern "system" fn(*mut CefRequestPrefix, *const CefString)>,
    pub get_method: Option<unsafe extern "system" fn(*mut CefRequestPrefix) -> *mut CefString>,
    pub set_method: Option<unsafe extern "system" fn(*mut CefRequestPrefix, *const CefString)>,
    pub set_referrer: *mut c_void,
    pub get_referrer_url: *mut c_void,
    pub get_referrer_policy: *mut c_void,
    pub get_post_data: Option<unsafe extern "system" fn(*mut CefRequestPrefix) -> *mut c_void>,
    pub set_post_data: Option<unsafe extern "system" fn(*mut CefRequestPrefix, *mut c_void)>,
    pub get_header_map: Option<unsafe extern "system" fn(*mut CefRequestPrefix, *mut c_void)>,
    pub set_header_map: Option<unsafe extern "system" fn(*mut CefRequestPrefix, *mut c_void)>,
    pub get_header_by_name: Option<
        unsafe extern "system" fn(*mut CefRequestPrefix, *const CefString) -> *mut CefString,
    >,
    pub set_header_by_name: Option<
        unsafe extern "system" fn(*mut CefRequestPrefix, *const CefString, *const CefString, i32),
    >,
    pub set: Option<
        unsafe extern "system" fn(
            *mut CefRequestPrefix,
            *const CefString,
            *const CefString,
            *mut c_void,
            *mut c_void,
        ),
    >,
}

#[repr(C)]
pub struct CefCallbackPrefix {
    pub base: CefBaseRefCounted,
    pub cont: Option<unsafe extern "system" fn(*mut CefCallbackPrefix)>,
    pub cancel: Option<unsafe extern "system" fn(*mut CefCallbackPrefix)>,
}

#[repr(C)]
pub struct CefResponsePrefix {
    pub base: CefBaseRefCounted,
    pub is_read_only: *mut c_void,
    pub get_error: *mut c_void,
    pub set_error: *mut c_void,
    pub get_status: Option<unsafe extern "system" fn(*mut CefResponsePrefix) -> i32>,
    pub set_status: Option<unsafe extern "system" fn(*mut CefResponsePrefix, i32)>,
    pub get_status_text: *mut c_void,
    pub set_status_text:
        Option<unsafe extern "system" fn(*mut CefResponsePrefix, *const CefString)>,
    pub get_mime_type: *mut c_void,
    pub set_mime_type: Option<unsafe extern "system" fn(*mut CefResponsePrefix, *const CefString)>,
    pub get_charset: *mut c_void,
    pub set_charset: Option<unsafe extern "system" fn(*mut CefResponsePrefix, *const CefString)>,
    pub get_header_by_name: *mut c_void,
    pub set_header_by_name: Option<
        unsafe extern "system" fn(*mut CefResponsePrefix, *const CefString, *const CefString, i32),
    >,
    pub get_header_map: Option<unsafe extern "system" fn(*mut CefResponsePrefix, *mut c_void)>,
    pub set_header_map: Option<unsafe extern "system" fn(*mut CefResponsePrefix, *mut c_void)>,
}

#[repr(C)]
pub struct CefResourceHandler {
    pub base: CefBaseRefCounted,
    pub open: Option<
        unsafe extern "system" fn(
            *mut CefResourceHandler,
            *mut CefRequestPrefix,
            *mut i32,
            *mut c_void,
        ) -> i32,
    >,
    pub process_request: Option<
        unsafe extern "system" fn(
            *mut CefResourceHandler,
            *mut CefRequestPrefix,
            *mut c_void,
        ) -> i32,
    >,
    pub get_response_headers: Option<
        unsafe extern "system" fn(
            *mut CefResourceHandler,
            *mut CefResponsePrefix,
            *mut i64,
            *mut CefString,
        ),
    >,
    pub skip: Option<
        unsafe extern "system" fn(*mut CefResourceHandler, i64, *mut i64, *mut c_void) -> i32,
    >,
    pub read: Option<
        unsafe extern "system" fn(
            *mut CefResourceHandler,
            *mut c_void,
            i32,
            *mut i32,
            *mut c_void,
        ) -> i32,
    >,
    pub read_response: Option<
        unsafe extern "system" fn(
            *mut CefResourceHandler,
            *mut c_void,
            i32,
            *mut i32,
            *mut c_void,
        ) -> i32,
    >,
    pub cancel: Option<unsafe extern "system" fn(*mut CefResourceHandler)>,
    ref_count: AtomicUsize,
    response: crate::assets::AssetResponse,
    cursor: usize,
    read_limit: usize,
    range_requested: bool,
    range: Option<crate::assets::AssetRange>,
}

#[repr(C)]
pub struct CefRenderProcessHandler {
    pub base: CefBaseRefCounted,
    pub on_web_kit_initialized: *mut c_void,
    pub on_browser_created: Option<OnBrowserCreated>,
    pub on_browser_destroyed: *mut c_void,
    pub get_load_handler: *mut c_void,
    pub on_context_created: Option<OnContextCreated>,
}

#[repr(C)]
pub struct CefDictionaryValuePrefix {
    pub base: CefBaseRefCounted,
    pub is_valid: *mut c_void,
    pub is_owned: *mut c_void,
    pub is_read_only: *mut c_void,
    pub is_same: *mut c_void,
    pub is_equal: *mut c_void,
    pub copy: *mut c_void,
    pub get_size: *mut c_void,
    pub clear: *mut c_void,
    pub has_key:
        Option<unsafe extern "system" fn(*mut CefDictionaryValuePrefix, *const CefString) -> i32>,
    pub get_keys: *mut c_void,
    pub remove: *mut c_void,
    pub get_type: *mut c_void,
    pub get_value: *mut c_void,
    pub get_bool: *mut c_void,
    pub get_int: *mut c_void,
    pub get_double: *mut c_void,
    pub get_string: *mut c_void,
    pub get_binary: *mut c_void,
    pub get_dictionary: *mut c_void,
    pub get_list: *mut c_void,
    pub set_value: *mut c_void,
    pub set_null:
        Option<unsafe extern "system" fn(*mut CefDictionaryValuePrefix, *const CefString) -> i32>,
}

#[repr(C)]
pub struct CefFramePrefix {
    pub base: CefBaseRefCounted,
    pub is_valid: *mut c_void,
    pub undo: *mut c_void,
    pub redo: *mut c_void,
    pub cut: *mut c_void,
    pub copy: *mut c_void,
    pub paste: *mut c_void,
    pub del: *mut c_void,
    pub select_all: *mut c_void,
    pub view_source: *mut c_void,
    pub get_source: *mut c_void,
    pub get_text: *mut c_void,
    pub load_request: *mut c_void,
    pub load_url: *mut c_void,
    pub execute_java_script: Option<
        unsafe extern "system" fn(*mut CefFramePrefix, *const CefString, *const CefString, i32),
    >,
    pub is_main: Option<unsafe extern "system" fn(*mut CefFramePrefix) -> i32>,
    pub is_focused: *mut c_void,
    pub get_name: *mut c_void,
    pub get_identifier: *mut c_void,
    pub get_parent: *mut c_void,
    pub get_url: Option<unsafe extern "system" fn(*mut CefFramePrefix) -> *mut CefString>,
    pub get_browser: *mut c_void,
    pub get_v8context: *mut c_void,
    pub visit_dom: *mut c_void,
    pub create_urlrequest: Option<
        unsafe extern "system" fn(
            *mut CefFramePrefix,
            *mut CefRequestPrefix,
            *mut CefUrlRequestClient,
        ) -> *mut CefUrlRequestPrefix,
    >,
    pub send_process_message:
        Option<unsafe extern "system" fn(*mut CefFramePrefix, i32, *mut CefProcessMessagePrefix)>,
}

#[repr(C)]
pub struct CefUrlRequestPrefix {
    pub base: CefBaseRefCounted,
    pub get_request: *mut c_void,
    pub get_client: *mut c_void,
    pub get_request_status: *mut c_void,
    pub get_request_error: *mut c_void,
    pub get_response:
        Option<unsafe extern "system" fn(*mut CefUrlRequestPrefix) -> *mut CefResponsePrefix>,
    pub response_was_cached: *mut c_void,
    pub cancel: Option<unsafe extern "system" fn(*mut CefUrlRequestPrefix)>,
}

#[repr(C)]
pub struct CefUrlRequestClient {
    pub base: CefBaseRefCounted,
    pub on_request_complete:
        Option<unsafe extern "system" fn(*mut CefUrlRequestClient, *mut CefUrlRequestPrefix)>,
    pub on_upload_progress: Option<
        unsafe extern "system" fn(*mut CefUrlRequestClient, *mut CefUrlRequestPrefix, i64, i64),
    >,
    pub on_download_progress: Option<
        unsafe extern "system" fn(*mut CefUrlRequestClient, *mut CefUrlRequestPrefix, i64, i64),
    >,
    pub on_download_data: Option<
        unsafe extern "system" fn(
            *mut CefUrlRequestClient,
            *mut CefUrlRequestPrefix,
            *const c_void,
            usize,
        ),
    >,
    pub get_auth_credentials: *mut c_void,
    ref_count: AtomicUsize,
    data: *mut Vec<u8>,
    response_callback: *mut CefCallbackPrefix,
    response_length: AtomicI64,
    done: AtomicBool,
    downloaded: AtomicUsize,
}

#[repr(C)]
pub struct CefRiotClientResourceHandler {
    pub base: CefBaseRefCounted,
    pub open: Option<
        unsafe extern "system" fn(
            *mut CefRiotClientResourceHandler,
            *mut CefRequestPrefix,
            *mut i32,
            *mut CefCallbackPrefix,
        ) -> i32,
    >,
    pub process_request: Option<
        unsafe extern "system" fn(
            *mut CefRiotClientResourceHandler,
            *mut CefRequestPrefix,
            *mut CefCallbackPrefix,
        ) -> i32,
    >,
    pub get_response_headers: Option<
        unsafe extern "system" fn(
            *mut CefRiotClientResourceHandler,
            *mut CefResponsePrefix,
            *mut i64,
            *mut CefString,
        ),
    >,
    pub skip: *mut c_void,
    pub read: Option<
        unsafe extern "system" fn(
            *mut CefRiotClientResourceHandler,
            *mut c_void,
            i32,
            *mut i32,
            *mut c_void,
        ) -> i32,
    >,
    pub read_response: Option<
        unsafe extern "system" fn(
            *mut CefRiotClientResourceHandler,
            *mut c_void,
            i32,
            *mut i32,
            *mut c_void,
        ) -> i32,
    >,
    pub cancel: Option<unsafe extern "system" fn(*mut CefRiotClientResourceHandler)>,
    ref_count: AtomicUsize,
    frame: *mut CefFramePrefix,
    url_request: *mut CefUrlRequestPrefix,
    client: *mut CefUrlRequestClient,
    data: Vec<u8>,
    bytes_read: usize,
}

#[repr(C)]
pub struct CefV8ContextPrefix {
    pub base: CefBaseRefCounted,
    pub get_task_runner: *mut c_void,
    pub is_valid: *mut c_void,
    pub get_browser: *mut c_void,
    pub get_frame: *mut c_void,
    pub get_global: Option<unsafe extern "system" fn(*mut CefV8ContextPrefix) -> *mut CefV8Value>,
    pub enter: Option<unsafe extern "system" fn(*mut CefV8ContextPrefix) -> i32>,
    pub exit: Option<unsafe extern "system" fn(*mut CefV8ContextPrefix) -> i32>,
}

#[repr(C)]
pub struct CefV8Handler {
    pub base: CefBaseRefCounted,
    pub execute: Option<V8Execute>,
}

#[repr(C)]
pub struct CefV8Value {
    pub base: CefBaseRefCounted,
    pub is_valid: *mut c_void,
    pub is_undefined: *mut c_void,
    pub is_null: Option<unsafe extern "system" fn(*mut CefV8Value) -> i32>,
    pub is_bool: *mut c_void,
    pub is_int: *mut c_void,
    pub is_uint: *mut c_void,
    pub is_double: *mut c_void,
    pub is_date: *mut c_void,
    pub is_string: Option<unsafe extern "system" fn(*mut CefV8Value) -> i32>,
    pub is_object: *mut c_void,
    pub is_array: *mut c_void,
    pub is_array_buffer: *mut c_void,
    pub is_function: *mut c_void,
    pub is_promise: *mut c_void,
    pub is_same: *mut c_void,
    pub get_bool_value: Option<unsafe extern "system" fn(*mut CefV8Value) -> i32>,
    pub get_int_value: *mut c_void,
    pub get_uint_value: *mut c_void,
    pub get_double_value: Option<unsafe extern "system" fn(*mut CefV8Value) -> f64>,
    pub get_date_value: *mut c_void,
    pub get_string_value: Option<unsafe extern "system" fn(*mut CefV8Value) -> *mut CefString>,
    pub is_user_created: *mut c_void,
    pub has_exception: *mut c_void,
    pub get_exception: *mut c_void,
    pub clear_exception: *mut c_void,
    pub will_rethrow_exceptions: *mut c_void,
    pub set_rethrow_exceptions: *mut c_void,
    pub has_value_bykey: *mut c_void,
    pub has_value_byindex: *mut c_void,
    pub delete_value_bykey: *mut c_void,
    pub delete_value_byindex: *mut c_void,
    pub get_value_bykey: *mut c_void,
    pub get_value_byindex: *mut c_void,
    pub set_value_bykey: Option<
        unsafe extern "system" fn(*mut CefV8Value, *const CefString, *mut CefV8Value, i32) -> i32,
    >,
}

#[repr(C)]
pub struct CefClientPrefix {
    pub base: CefBaseRefCounted,
    pub get_audio_handler: *mut c_void,
    pub get_command_handler: *mut c_void,
    pub get_context_menu_handler: *mut c_void,
    pub get_dialog_handler: *mut c_void,
    pub get_display_handler: *mut c_void,
    pub get_download_handler: *mut c_void,
    pub get_drag_handler: *mut c_void,
    pub get_find_handler: *mut c_void,
    pub get_focus_handler: *mut c_void,
    pub get_frame_handler: *mut c_void,
    pub get_permission_handler: *mut c_void,
    pub get_jsdialog_handler: *mut c_void,
    pub get_keyboard_handler: Option<GetKeyboardHandler>,
    pub get_life_span_handler: Option<GetLifeSpanHandler>,
    pub get_load_handler: *mut c_void,
    pub get_print_handler: *mut c_void,
    pub get_render_handler: *mut c_void,
    pub get_request_handler: *mut c_void,
    pub on_process_message_received: Option<ClientOnProcessMessageReceived>,
}

#[repr(C)]
pub struct CefKeyboardHandlerPrefix {
    pub base: CefBaseRefCounted,
    pub on_pre_key_event: Option<OnPreKeyEvent>,
    pub on_key_event: *mut c_void,
}

#[repr(C)]
pub struct CefLifeSpanHandlerPrefix {
    pub base: CefBaseRefCounted,
    pub on_before_popup: *mut c_void,
    pub on_after_created: Option<OnAfterCreated>,
    pub do_close: *mut c_void,
    pub on_before_close: *mut c_void,
}

#[repr(C)]
pub struct CefKeyEvent {
    pub type_: i32,
    pub modifiers: u32,
    pub windows_key_code: i32,
    pub native_key_code: i32,
    pub is_system_key: i32,
    pub character: u16,
    pub unmodified_character: u16,
    pub focus_on_editable_field: i32,
}

#[repr(C)]
pub struct CefBrowserPrefix {
    pub base: CefBaseRefCounted,
    pub is_valid: *mut c_void,
    pub get_host:
        Option<unsafe extern "system" fn(*mut CefBrowserPrefix) -> *mut CefBrowserHostPrefix>,
    pub can_go_back: *mut c_void,
    pub go_back: *mut c_void,
    pub can_go_forward: *mut c_void,
    pub go_forward: *mut c_void,
    pub is_loading: *mut c_void,
    pub reload: *mut c_void,
    pub reload_ignore_cache: Option<unsafe extern "system" fn(*mut CefBrowserPrefix)>,
    pub stop_load: *mut c_void,
    pub get_identifier: Option<unsafe extern "system" fn(*mut CefBrowserPrefix) -> i32>,
    pub is_same: *mut c_void,
    pub is_popup: *mut c_void,
    pub has_document: *mut c_void,
    pub get_main_frame:
        Option<unsafe extern "system" fn(*mut CefBrowserPrefix) -> *mut CefFramePrefix>,
    pub get_focused_frame:
        Option<unsafe extern "system" fn(*mut CefBrowserPrefix) -> *mut CefFramePrefix>,
}

#[repr(C)]
pub struct CefBrowserHostPrefix {
    pub base: CefBaseRefCounted,
    pub get_browser: *mut c_void,
    pub close_browser: *mut c_void,
    pub try_close_browser: *mut c_void,
    pub set_focus: *mut c_void,
    pub get_window_handle: Option<unsafe extern "system" fn(*mut CefBrowserHostPrefix) -> isize>,
    pub get_opener_window_handle: *mut c_void,
    pub has_view: *mut c_void,
    pub get_client: *mut c_void,
    pub get_request_context: *mut c_void,
    pub get_zoom_level: *mut c_void,
    pub set_zoom_level: *mut c_void,
    pub run_file_dialog: *mut c_void,
    pub start_download: *mut c_void,
    pub download_image: *mut c_void,
    pub print: *mut c_void,
    pub print_to_pdf: *mut c_void,
    pub find: *mut c_void,
    pub stop_finding: *mut c_void,
    pub show_dev_tools: Option<
        unsafe extern "system" fn(
            *mut CefBrowserHostPrefix,
            *const CefWindowInfo,
            *mut CefClientPrefix,
            *const c_void,
            *const c_void,
        ),
    >,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct CefRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[repr(C)]
pub struct CefWindowInfo {
    pub ex_style: u32,
    pub window_name: CefString,
    pub style: u32,
    pub bounds: CefRect,
    pub parent_window: isize,
    pub menu: isize,
    pub windowless_rendering_enabled: i32,
    pub shared_texture_enabled: i32,
    pub external_begin_frame_enabled: i32,
    pub window: isize,
}

#[repr(C)]
pub struct CefProcessMessagePrefix {
    pub base: CefBaseRefCounted,
    pub is_valid: *mut c_void,
    pub is_read_only: *mut c_void,
    pub copy: *mut c_void,
    pub get_name: Option<unsafe extern "system" fn(*mut CefProcessMessagePrefix) -> *mut CefString>,
    pub get_argument_list:
        Option<unsafe extern "system" fn(*mut CefProcessMessagePrefix) -> *mut CefListValuePrefix>,
    pub get_shared_memory_region: *mut c_void,
}

#[repr(C)]
pub struct CefListValuePrefix {
    pub base: CefBaseRefCounted,
    pub is_valid: *mut c_void,
    pub is_owned: *mut c_void,
    pub is_read_only: *mut c_void,
    pub is_same: *mut c_void,
    pub is_equal: *mut c_void,
    pub copy: *mut c_void,
    pub set_size: *mut c_void,
    pub get_size: *mut c_void,
    pub clear: *mut c_void,
    pub remove: *mut c_void,
    pub get_type: Option<unsafe extern "system" fn(*mut CefListValuePrefix, usize) -> i32>,
    pub get_value: *mut c_void,
    pub get_bool: Option<unsafe extern "system" fn(*mut CefListValuePrefix, usize) -> i32>,
    pub get_int: *mut c_void,
    pub get_double: Option<unsafe extern "system" fn(*mut CefListValuePrefix, usize) -> f64>,
    pub get_string: *mut c_void,
    pub get_binary: *mut c_void,
    pub get_dictionary: *mut c_void,
    pub get_list: *mut c_void,
    pub set_value: *mut c_void,
    pub set_null: Option<unsafe extern "system" fn(*mut CefListValuePrefix, usize) -> i32>,
    pub set_bool: Option<unsafe extern "system" fn(*mut CefListValuePrefix, usize, i32) -> i32>,
    pub set_int: *mut c_void,
    pub set_double: Option<unsafe extern "system" fn(*mut CefListValuePrefix, usize, f64) -> i32>,
}

unsafe extern "system" fn factory_add_ref(factory: *mut CefBaseRefCounted) {
    let _ = factory;
}

unsafe extern "system" fn factory_release(factory: *mut CefBaseRefCounted) -> i32 {
    let _ = factory;
    0
}

unsafe extern "system" fn factory_has_one_ref(factory: *mut CefBaseRefCounted) -> i32 {
    let _ = factory;
    0
}

unsafe extern "system" fn factory_has_at_least_one_ref(factory: *mut CefBaseRefCounted) -> i32 {
    let _ = factory;
    1
}

unsafe extern "system" fn handler_add_ref(base: *mut CefBaseRefCounted) {
    if !base.is_null() {
        unsafe {
            (*(base as *mut CefResourceHandler))
                .ref_count
                .fetch_add(1, Ordering::Relaxed)
        };
    }
}

unsafe extern "system" fn handler_release(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    let handler = base as *mut CefResourceHandler;
    if unsafe { (*handler).ref_count.fetch_sub(1, Ordering::Release) } == 1 {
        std::sync::atomic::fence(Ordering::Acquire);
        unsafe { drop(Box::from_raw(handler)) };
        1
    } else {
        0
    }
}

unsafe extern "system" fn handler_has_one_ref(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    (unsafe {
        (*(base as *mut CefResourceHandler))
            .ref_count
            .load(Ordering::Acquire)
    } == 1) as i32
}

unsafe extern "system" fn handler_has_at_least_one_ref(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    (unsafe {
        (*(base as *mut CefResourceHandler))
            .ref_count
            .load(Ordering::Acquire)
    } >= 1) as i32
}

unsafe extern "system" fn handler_open(
    handler: *mut CefResourceHandler,
    request: *mut CefRequestPrefix,
    handle_request: *mut i32,
    callback: *mut c_void,
) -> i32 {
    let _ = callback;
    if !handler.is_null() {
        let handler = unsafe { &mut *handler };
        if let Some(range_header) = unsafe { request_header_by_name(request, "Range") } {
            handler.range_requested = true;
            handler.range =
                crate::assets::parse_range_header(&range_header, handler.response.body.len());
            if let Some(range) = &handler.range {
                handler.cursor = range.start;
                handler.read_limit = range.end.saturating_add(1);
            } else {
                handler.read_limit = 0;
            }
        }
    }
    if !handle_request.is_null() {
        unsafe { *handle_request = 1 };
    }
    1
}

unsafe extern "system" fn handler_process_request(
    handler: *mut CefResourceHandler,
    request: *mut CefRequestPrefix,
    callback: *mut c_void,
) -> i32 {
    let _ = (handler, request, callback);
    1
}

unsafe extern "system" fn handler_get_response_headers(
    handler: *mut CefResourceHandler,
    response: *mut CefResponsePrefix,
    response_length: *mut i64,
    redirect_url: *mut CefString,
) {
    let _ = redirect_url;
    if handler.is_null() {
        return;
    }

    let asset = unsafe { &(*handler).response };
    let _ = asset.path.as_os_str().len();
    let range_status = asset_range_status(handler);

    if !response.is_null() {
        let status_text = CefString::leaked(range_status.status_text());
        let mime = CefString::leaked(&asset.mime);
        let charset = CefString::leaked("utf-8");

        unsafe {
            if let Some(set_status) = (*response).set_status {
                set_status(response, range_status.status_code());
            }
            if let Some(set_status_text) = (*response).set_status_text {
                set_status_text(response, &status_text);
            }
            if let Some(set_mime_type) = (*response).set_mime_type {
                set_mime_type(response, &mime);
            }
            if let Some(set_charset) = (*response).set_charset {
                set_charset(response, &charset);
            }
            set_header(response, "Access-Control-Allow-Origin", "*");
            if asset.no_cache {
                set_header(response, "Cache-Control", "no-store");
            } else {
                set_header(response, "Cache-Control", "max-age=31536000, immutable");
                set_header(response, "ETag", &asset.etag);
            }
            if let AssetRangeStatus::Partial(range) = &range_status {
                set_header(response, "Accept-Ranges", "bytes");
                set_header(
                    response,
                    "Content-Length",
                    &range.content_length.to_string(),
                );
                set_header(response, "Content-Range", &range.content_range);
            }
        }
    }

    if !response_length.is_null() {
        let length = match range_status {
            AssetRangeStatus::Full => asset.body.len() as i64,
            AssetRangeStatus::Partial(range) => range.content_length as i64,
            AssetRangeStatus::Invalid => -1,
        };
        unsafe { *response_length = length };
    }
}

unsafe extern "system" fn handler_skip(
    handler: *mut CefResourceHandler,
    bytes_to_skip: i64,
    bytes_skipped: *mut i64,
    callback: *mut c_void,
) -> i32 {
    let _ = callback;
    if handler.is_null() || bytes_to_skip < 0 {
        return 0;
    }

    let handler = unsafe { &mut *handler };
    let remaining = handler.read_limit.saturating_sub(handler.cursor);
    let skipped = remaining.min(bytes_to_skip as usize);
    handler.cursor += skipped;

    if !bytes_skipped.is_null() {
        unsafe { *bytes_skipped = skipped as i64 };
    }

    1
}

unsafe extern "system" fn handler_read(
    handler: *mut CefResourceHandler,
    data_out: *mut c_void,
    bytes_to_read: i32,
    bytes_read: *mut i32,
    callback: *mut c_void,
) -> i32 {
    let _ = callback;
    if handler.is_null() || data_out.is_null() || bytes_to_read <= 0 {
        if !bytes_read.is_null() {
            unsafe { *bytes_read = 0 };
        }
        return 0;
    }

    let handler = unsafe { &mut *handler };
    let end = handler.read_limit.min(handler.response.body.len());
    let remaining = &handler.response.body[handler.cursor..end];
    let to_copy = remaining.len().min(bytes_to_read as usize);

    if to_copy == 0 {
        if !bytes_read.is_null() {
            unsafe { *bytes_read = 0 };
        }
        return 0;
    }

    unsafe {
        std::ptr::copy_nonoverlapping(remaining.as_ptr(), data_out.cast::<u8>(), to_copy);
    }
    handler.cursor += to_copy;

    if !bytes_read.is_null() {
        unsafe { *bytes_read = to_copy as i32 };
    }

    1
}

unsafe extern "system" fn handler_cancel(handler: *mut CefResourceHandler) {
    let _ = handler;
}

unsafe extern "system" fn urlrequest_client_add_ref(base: *mut CefBaseRefCounted) {
    if !base.is_null() {
        unsafe {
            (*(base as *mut CefUrlRequestClient))
                .ref_count
                .fetch_add(1, Ordering::Relaxed)
        };
    }
}

unsafe extern "system" fn urlrequest_client_release(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    let client = base as *mut CefUrlRequestClient;
    if unsafe { (*client).ref_count.fetch_sub(1, Ordering::Release) } == 1 {
        std::sync::atomic::fence(Ordering::Acquire);
        unsafe { drop(Box::from_raw(client)) };
        1
    } else {
        0
    }
}

unsafe extern "system" fn urlrequest_client_has_one_ref(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    (unsafe {
        (*(base as *mut CefUrlRequestClient))
            .ref_count
            .load(Ordering::Acquire)
    } == 1) as i32
}

unsafe extern "system" fn urlrequest_client_has_at_least_one_ref(
    base: *mut CefBaseRefCounted,
) -> i32 {
    if base.is_null() {
        return 0;
    }

    (unsafe {
        (*(base as *mut CefUrlRequestClient))
            .ref_count
            .load(Ordering::Acquire)
    } >= 1) as i32
}

unsafe extern "system" fn urlrequest_on_request_complete(
    client: *mut CefUrlRequestClient,
    request: *mut CefUrlRequestPrefix,
) {
    let _ = request;
    let bytes = if client.is_null() {
        0
    } else {
        unsafe {
            (*client).done.store(true, Ordering::Release);
            (*client).downloaded.load(Ordering::Relaxed)
        }
    };
    crate::cef::record_riotclient_urlrequest_complete(bytes);
}

unsafe extern "system" fn urlrequest_on_upload_progress(
    client: *mut CefUrlRequestClient,
    request: *mut CefUrlRequestPrefix,
    current: i64,
    total: i64,
) {
    let _ = (request, current);
    if !client.is_null() {
        unsafe { (*client).response_length.store(total, Ordering::Release) };
    }
}

unsafe extern "system" fn urlrequest_on_download_progress(
    client: *mut CefUrlRequestClient,
    request: *mut CefUrlRequestPrefix,
    current: i64,
    total: i64,
) {
    let _ = (client, request, current, total);
}

unsafe extern "system" fn urlrequest_on_download_data(
    client: *mut CefUrlRequestClient,
    request: *mut CefUrlRequestPrefix,
    data: *const c_void,
    data_length: usize,
) {
    let _ = request;
    if !client.is_null() {
        unsafe {
            if !data.is_null() && !(*client).data.is_null() {
                let chunk = std::slice::from_raw_parts(data.cast::<u8>(), data_length);
                (*(*client).data).extend_from_slice(chunk);
            }
            (*client)
                .downloaded
                .fetch_add(data_length, Ordering::Relaxed)
        };
        let callback = unsafe { (*client).response_callback };
        if !callback.is_null() {
            unsafe {
                if let Some(cont) = (*callback).cont {
                    cont(callback);
                }
                (*client).response_callback = std::ptr::null_mut();
            }
        }
    }
    crate::cef::record_riotclient_urlrequest_data(data_length);
}

fn riotclient_urlrequest_client(
    data: *mut Vec<u8>,
    response_callback: *mut CefCallbackPrefix,
) -> *mut CefUrlRequestClient {
    Box::into_raw(Box::new(CefUrlRequestClient {
        base: CefBaseRefCounted {
            size: std::mem::size_of::<CefUrlRequestClient>(),
            add_ref: Some(urlrequest_client_add_ref),
            release: Some(urlrequest_client_release),
            has_one_ref: Some(urlrequest_client_has_one_ref),
            has_at_least_one_ref: Some(urlrequest_client_has_at_least_one_ref),
        },
        on_request_complete: Some(urlrequest_on_request_complete),
        on_upload_progress: Some(urlrequest_on_upload_progress),
        on_download_progress: Some(urlrequest_on_download_progress),
        on_download_data: Some(urlrequest_on_download_data),
        get_auth_credentials: std::ptr::null_mut(),
        ref_count: AtomicUsize::new(1),
        data,
        response_callback,
        response_length: AtomicI64::new(-1),
        done: AtomicBool::new(false),
        downloaded: AtomicUsize::new(0),
    }))
}

unsafe fn set_header(response: *mut CefResponsePrefix, name: &str, value: &str) {
    if let Some(set_header_by_name) = unsafe { (*response).set_header_by_name } {
        let name = CefString::leaked(name);
        let value = CefString::leaked(value);
        unsafe { set_header_by_name(response, &name, &value, 1) };
    }
}

unsafe fn request_header_by_name(request: *mut CefRequestPrefix, name: &str) -> Option<String> {
    if request.is_null() {
        return None;
    }

    let get_header_by_name = unsafe { (*request).get_header_by_name }?;
    let name = CefString::leaked(name);
    let value = unsafe { get_header_by_name(request, &name) };
    let header = unsafe { cef_string_to_string(value) };
    unsafe { cef_userfree_utf16_free(value) };
    header.filter(|header| !header.is_empty())
}

unsafe fn request_url(request: *mut CefRequestPrefix) -> Option<String> {
    if request.is_null() {
        return None;
    }

    let get_url = unsafe { (*request).get_url }?;
    let value = unsafe { get_url(request) };
    let url = unsafe { cef_string_to_string(value) };
    unsafe { cef_userfree_utf16_free(value) };
    url
}

unsafe fn request_method(request: *mut CefRequestPrefix) -> Option<String> {
    if request.is_null() {
        return None;
    }

    let get_method = unsafe { (*request).get_method }?;
    let value = unsafe { get_method(request) };
    let method = unsafe { cef_string_to_string(value) };
    unsafe { cef_userfree_utf16_free(value) };
    method
}

unsafe fn request_post_data(request: *mut CefRequestPrefix) -> *mut c_void {
    if request.is_null() {
        return std::ptr::null_mut();
    }

    unsafe {
        (*request)
            .get_post_data
            .map(|get_post_data| get_post_data(request))
            .unwrap_or(std::ptr::null_mut())
    }
}

fn request_create() -> *mut CefRequestPrefix {
    type CreateRequest = unsafe extern "C" fn() -> *mut CefRequestPrefix;

    let Some(proc) = libcef_proc("cef_request_create") else {
        return std::ptr::null_mut();
    };
    let create: CreateRequest = unsafe { std::mem::transmute(proc) };
    unsafe { create() }
}

fn string_multimap_alloc() -> *mut c_void {
    type Alloc = unsafe extern "C" fn() -> *mut c_void;

    let Some(proc) = libcef_proc("cef_string_multimap_alloc") else {
        return std::ptr::null_mut();
    };
    let alloc: Alloc = unsafe { std::mem::transmute(proc) };
    unsafe { alloc() }
}

unsafe fn string_multimap_free(map: *mut c_void) {
    if map.is_null() {
        return;
    }

    type Free = unsafe extern "C" fn(*mut c_void);
    let Some(proc) = libcef_proc("cef_string_multimap_free") else {
        return;
    };
    let free: Free = unsafe { std::mem::transmute(proc) };
    unsafe { free(map) };
}

unsafe fn request_header_map(request: *mut CefRequestPrefix) -> *mut c_void {
    if request.is_null() {
        return std::ptr::null_mut();
    }

    let map = string_multimap_alloc();
    if map.is_null() {
        return std::ptr::null_mut();
    }

    if let Some(get_header_map) = unsafe { (*request).get_header_map } {
        unsafe { get_header_map(request, map) };
        map
    } else {
        unsafe { string_multimap_free(map) };
        std::ptr::null_mut()
    }
}

unsafe fn request_set_url_method_post(
    request: *mut CefRequestPrefix,
    url: &str,
    method: &str,
    post_data: *mut c_void,
    headers: *mut c_void,
) -> bool {
    if request.is_null() {
        return false;
    }

    let url = CefString::leaked(url);
    let method = CefString::leaked(method);

    unsafe {
        if let Some(set) = (*request).set {
            set(request, &url, &method, post_data, headers);
            true
        } else {
            if let Some(set_url) = (*request).set_url {
                set_url(request, &url);
            }
            if let Some(set_method) = (*request).set_method {
                set_method(request, &method);
            }
            if let Some(set_post_data) = (*request).set_post_data {
                set_post_data(request, post_data);
            }
            if let Some(set_header_map) = (*request).set_header_map {
                set_header_map(request, headers);
            }
            true
        }
    }
}

unsafe fn request_set_header(
    request: *mut CefRequestPrefix,
    name: &str,
    value: &str,
    overwrite: bool,
) -> bool {
    if request.is_null() {
        return false;
    }

    let name = CefString::leaked(name);
    let value = CefString::leaked(value);

    unsafe {
        (*request).set_header_by_name.is_some_and(|set_header| {
            set_header(request, &name, &value, i32::from(overwrite));
            true
        })
    }
}

unsafe fn rewritten_riotclient_request(
    source: *mut CefRequestPrefix,
) -> Option<(*mut CefRequestPrefix, String, String)> {
    let proxy_url = unsafe { request_url(source) }?;
    let target_url = crate::riotclient::target_url(&proxy_url)?;
    let method = unsafe { request_method(source) }.unwrap_or_else(|| "GET".into());
    let credentials = crate::riotclient::credentials()?;
    let post_data = unsafe { request_post_data(source) };
    let headers = unsafe { request_header_map(source) };
    let request = request_create();

    if request.is_null() {
        unsafe { string_multimap_free(headers) };
        return None;
    }

    unsafe {
        request_set_url_method_post(request, &target_url, &method, post_data, headers);
        string_multimap_free(headers);
        request_set_header(request, "Authorization", &credentials.authorization, true);
    }

    Some((request, proxy_url, target_url))
}

unsafe fn launch_riotclient_urlrequest(
    frame: *mut CefFramePrefix,
    request: *mut CefRequestPrefix,
    client: *mut CefUrlRequestClient,
) -> *mut CefUrlRequestPrefix {
    if request.is_null() {
        return std::ptr::null_mut();
    }

    if client.is_null() {
        return std::ptr::null_mut();
    }

    if !frame.is_null() {
        if let Some(create_urlrequest) = unsafe { (*frame).create_urlrequest } {
            let urlrequest = unsafe { create_urlrequest(frame, request, client) };
            if !urlrequest.is_null() {
                crate::cef::record_riotclient_urlrequest_launch();
                return urlrequest;
            }
        }
    }

    type CreateUrlRequest = unsafe extern "C" fn(
        *mut CefRequestPrefix,
        *mut CefUrlRequestClient,
        *mut c_void,
    ) -> *mut CefUrlRequestPrefix;

    let Some(proc) = libcef_proc("cef_urlrequest_create") else {
        return std::ptr::null_mut();
    };
    let create: CreateUrlRequest = unsafe { std::mem::transmute(proc) };
    let urlrequest = unsafe { create(request, client, std::ptr::null_mut()) };
    if !urlrequest.is_null() {
        crate::cef::record_riotclient_urlrequest_launch();
        return urlrequest;
    }

    std::ptr::null_mut()
}

pub unsafe fn frame_url(frame: *mut CefFramePrefix) -> Option<String> {
    if frame.is_null() {
        return None;
    }

    let get_url = unsafe { (*frame).get_url }?;
    let value = unsafe { get_url(frame) };
    let url = unsafe { cef_string_to_string(value) };
    unsafe { cef_userfree_utf16_free(value) };
    url
}

pub unsafe fn frame_is_main(frame: *mut CefFramePrefix) -> bool {
    if frame.is_null() {
        return false;
    }

    unsafe { (*frame).is_main.is_some_and(|is_main| is_main(frame) != 0) }
}

pub unsafe fn execute_java_script(frame: *mut CefFramePrefix, script: &str, script_url: &str) {
    if frame.is_null() {
        return;
    }

    if let Some(execute) = unsafe { (*frame).execute_java_script } {
        let script = CefString::leaked(script);
        let script_url = CefString::leaked(script_url);
        unsafe { execute(frame, &script, &script_url, 1) };
    }
}

pub unsafe fn dictionary_has_key(dictionary: *mut CefDictionaryValuePrefix, key: &str) -> bool {
    if dictionary.is_null() {
        return false;
    }

    let key = CefString::leaked(key);
    unsafe {
        (*dictionary)
            .has_key
            .is_some_and(|has_key| has_key(dictionary, &key) != 0)
    }
}

pub unsafe fn dictionary_set_null(dictionary: *mut CefDictionaryValuePrefix, key: &str) -> bool {
    if dictionary.is_null() {
        return false;
    }

    let key = CefString::leaked(key);
    unsafe {
        (*dictionary)
            .set_null
            .is_some_and(|set_null| set_null(dictionary, &key) != 0)
    }
}

pub fn dictionary_create() -> *mut CefDictionaryValuePrefix {
    type CreateDictionary = unsafe extern "C" fn() -> *mut CefDictionaryValuePrefix;

    let Some(proc) = libcef_proc("cef_dictionary_value_create") else {
        return std::ptr::null_mut();
    };
    let create: CreateDictionary = unsafe { std::mem::transmute(proc) };
    unsafe { create() }
}

pub unsafe fn process_message_name(message: *mut CefProcessMessagePrefix) -> Option<String> {
    if message.is_null() {
        return None;
    }

    let get_name = unsafe { (*message).get_name }?;
    let name = unsafe { get_name(message) };
    let result = unsafe { cef_string_to_string(name) };
    unsafe { cef_userfree_utf16_free(name) };
    result
}

pub unsafe fn process_message_argument_list(
    message: *mut CefProcessMessagePrefix,
) -> *mut CefListValuePrefix {
    if message.is_null() {
        return std::ptr::null_mut();
    }

    unsafe {
        (*message)
            .get_argument_list
            .map(|get| get(message))
            .unwrap_or(std::ptr::null_mut())
    }
}

pub unsafe fn list_value_type(list: *mut CefListValuePrefix, index: usize) -> Option<i32> {
    if list.is_null() {
        return None;
    }

    let get_type = unsafe { (*list).get_type }?;
    Some(unsafe { get_type(list, index) })
}

pub unsafe fn list_bool(list: *mut CefListValuePrefix, index: usize) -> Option<bool> {
    if list.is_null() {
        return None;
    }

    let get_bool = unsafe { (*list).get_bool }?;
    Some(unsafe { get_bool(list, index) != 0 })
}

pub unsafe fn list_double(list: *mut CefListValuePrefix, index: usize) -> Option<f64> {
    if list.is_null() {
        return None;
    }

    let get_double = unsafe { (*list).get_double }?;
    Some(unsafe { get_double(list, index) })
}

pub unsafe fn list_set_null(list: *mut CefListValuePrefix, index: usize) -> bool {
    if list.is_null() {
        return false;
    }

    unsafe {
        (*list)
            .set_null
            .is_some_and(|set_null| set_null(list, index) != 0)
    }
}

pub unsafe fn list_set_bool(list: *mut CefListValuePrefix, index: usize, value: bool) -> bool {
    if list.is_null() {
        return false;
    }

    unsafe {
        (*list)
            .set_bool
            .is_some_and(|set_bool| set_bool(list, index, i32::from(value)) != 0)
    }
}

pub unsafe fn list_set_double(list: *mut CefListValuePrefix, index: usize, value: f64) -> bool {
    if list.is_null() {
        return false;
    }

    unsafe {
        (*list)
            .set_double
            .is_some_and(|set_double| set_double(list, index, value) != 0)
    }
}

pub unsafe fn browser_reload_ignore_cache(browser: *mut CefBrowserPrefix) -> bool {
    if browser.is_null() {
        return false;
    }

    unsafe {
        (*browser).reload_ignore_cache.is_some_and(|reload| {
            reload(browser);
            true
        })
    }
}

pub unsafe fn browser_execute_main_frame_script(
    browser: *mut CefBrowserPrefix,
    script: &str,
    script_url: &str,
) -> bool {
    if browser.is_null() {
        return false;
    }

    let Some(get_main_frame) = (unsafe { (*browser).get_main_frame }) else {
        return false;
    };
    let frame = unsafe { get_main_frame(browser) };
    if frame.is_null() {
        return false;
    }

    unsafe {
        execute_java_script(frame, script, script_url);
        release_ref_counted(&mut (*frame).base);
    }
    true
}

pub fn confirm_restart_client() -> bool {
    #[cfg(windows)]
    {
        const MB_YESNO: u32 = 0x0000_0004;
        const MB_ICONQUESTION: u32 = 0x0000_0020;
        const MB_TOPMOST: u32 = 0x0004_0000;
        const IDYES: i32 = 6;

        let text = wide_null("Do you want to do a full League Client restart?");
        let caption = wide_null("Pengu Loader");
        unsafe {
            MessageBoxW(
                0,
                text.as_ptr(),
                caption.as_ptr(),
                MB_YESNO | MB_ICONQUESTION | MB_TOPMOST,
            ) == IDYES
        }
    }

    #[cfg(not(windows))]
    {
        false
    }
}

pub fn alert(message: &str, caption: &str) {
    #[cfg(windows)]
    {
        const MB_OK: u32 = 0x0000_0000;
        const MB_ICONWARNING: u32 = 0x0000_0030;
        const MB_TOPMOST: u32 = 0x0004_0000;

        let text = wide_null(message);
        let caption = wide_null(caption);
        unsafe {
            MessageBoxW(
                0,
                text.as_ptr(),
                caption.as_ptr(),
                MB_OK | MB_ICONWARNING | MB_TOPMOST,
            );
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (message, caption);
    }
}

pub unsafe fn browser_open_devtools(browser: *mut CefBrowserPrefix) -> bool {
    if browser.is_null() {
        return false;
    }

    let Some(get_host) = (unsafe { (*browser).get_host }) else {
        return false;
    };
    let host = unsafe { get_host(browser) };
    if host.is_null() {
        return false;
    }

    let Some(show_dev_tools) = (unsafe { (*host).show_dev_tools }) else {
        unsafe { release_ref_counted(&mut (*host).base) };
        return false;
    };

    let caption = unsafe { focused_frame_url(browser) }
        .map(|url| format!("League Client DevTools - {url}"))
        .unwrap_or_else(|| "League Client DevTools - about:blank".into());
    let window_info = CefWindowInfo {
        ex_style: 0x0004_0000,
        window_name: CefString::leaked(&caption),
        style: 0x00CF_0000 | 0x0200_0000 | 0x0400_0000 | 0x1000_0000,
        bounds: CefRect {
            x: 100,
            y: 100,
            width: 1280,
            height: 720,
        },
        parent_window: 0,
        menu: 0,
        windowless_rendering_enabled: 0,
        shared_texture_enabled: 0,
        external_begin_frame_enabled: 0,
        window: 0,
    };

    unsafe {
        show_dev_tools(
            host,
            &window_info,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
        );
        release_ref_counted(&mut (*host).base);
    }

    true
}

pub unsafe fn browser_set_window_theme(browser: *mut CefBrowserPrefix, dark: bool) -> bool {
    let Some(window) = (unsafe { browser_root_window(browser) }) else {
        return false;
    };

    set_native_window_theme(window, dark)
}

pub unsafe fn browser_setup_window(browser: *mut CefBrowserPrefix) -> bool {
    let Some(browser_window) = (unsafe { browser_host_window(browser) }) else {
        return false;
    };
    let root = native_root_window(browser_window);
    let previous = MAIN_WINDOW_HANDLE.compare_exchange(0, root, Ordering::SeqCst, Ordering::SeqCst);
    if previous.is_err() {
        return true;
    }

    #[cfg(windows)]
    unsafe {
        let widget = FindWindowExA(
            browser_window,
            0,
            b"Chrome_WidgetWin_0\0".as_ptr(),
            std::ptr::null(),
        );
        if widget != 0 {
            const SW_HIDE: i32 = 0;
            ShowWindow(browser_window, SW_HIDE);
            SetParent(widget, root);
        }
    }

    set_native_window_theme(root, true);
    enable_native_window_shadow(root);
    if crate::config::option_bool("silent_mode", false) {
        install_silent_mode_window_hooks(root);
    }
    true
}

pub unsafe fn browser_clear_window_vibrancy(browser: *mut CefBrowserPrefix) -> bool {
    let Some(window) = (unsafe { browser_root_window(browser) }) else {
        return false;
    };

    clear_native_window_vibrancy(window)
}

pub unsafe fn browser_apply_window_vibrancy(
    browser: *mut CefBrowserPrefix,
    kind: u32,
    state: u32,
) -> bool {
    let Some(window) = (unsafe { browser_root_window(browser) }) else {
        return false;
    };

    apply_native_window_vibrancy(window, kind, state)
}

unsafe fn browser_root_window(browser: *mut CefBrowserPrefix) -> Option<isize> {
    let main_window = MAIN_WINDOW_HANDLE.load(Ordering::SeqCst);
    if main_window != 0 {
        return Some(main_window);
    }

    unsafe { browser_host_window(browser).map(native_root_window) }
}

unsafe fn browser_host_window(browser: *mut CefBrowserPrefix) -> Option<isize> {
    if browser.is_null() {
        return None;
    }

    let get_host = unsafe { (*browser).get_host }?;
    let host = unsafe { get_host(browser) };
    if host.is_null() {
        return None;
    }

    let window = unsafe {
        (*host)
            .get_window_handle
            .map(|get_window_handle| get_window_handle(host))
            .filter(|window| *window != 0)
    };
    unsafe { release_ref_counted(&mut (*host).base) };

    window
}

fn native_root_window(window: isize) -> isize {
    #[cfg(windows)]
    unsafe {
        const GA_ROOT: u32 = 2;
        let root = GetAncestor(window, GA_ROOT);
        if root == 0 { window } else { root }
    }

    #[cfg(not(windows))]
    {
        window
    }
}

fn set_native_window_theme(window: isize, dark: bool) -> bool {
    #[cfg(windows)]
    unsafe {
        let value: u32 = u32::from(dark);
        let mut applied = false;
        for attribute in [20_u32, 19_u32] {
            if DwmSetWindowAttribute(
                window,
                attribute,
                (&value as *const u32).cast::<c_void>(),
                std::mem::size_of::<u32>() as u32,
            ) == 0
            {
                applied = true;
            }
        }
        applied
    }

    #[cfg(not(windows))]
    {
        let _ = (window, dark);
        false
    }
}

fn enable_native_window_shadow(window: isize) -> bool {
    #[cfg(windows)]
    {
        let mut applied = set_window_attribute(window, 2, 2);
        applied |= extend_client_area(window, 1);
        unsafe {
            const SWP_NOSIZE: u32 = 0x0001;
            const SWP_NOMOVE: u32 = 0x0002;
            const SWP_NOACTIVATE: u32 = 0x0010;
            const SWP_FRAMECHANGED: u32 = 0x0020;
            applied |= SetWindowPos(
                window,
                0,
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            ) != 0;
        }
        applied
    }

    #[cfg(not(windows))]
    {
        let _ = window;
        false
    }
}

fn install_silent_mode_window_hooks(window: isize) -> bool {
    #[cfg(windows)]
    unsafe {
        let mut installed = false;
        let show_hook = &raw mut SILENT_SHOW_WINDOW_HOOK;
        if (*show_hook).is_none() {
            *show_hook = crate::hook::InlineHook::install(
                ShowWindow as *mut c_void,
                hooked_show_window as *const c_void,
            )
            .ok();
            installed |= (*show_hook).is_some();
        }

        let set_pos_hook = &raw mut SILENT_SET_WINDOW_POS_HOOK;
        if (*set_pos_hook).is_none() {
            *set_pos_hook = crate::hook::InlineHook::install(
                SetWindowPos as *mut c_void,
                hooked_set_window_pos as *const c_void,
            )
            .ok();
            installed |= (*set_pos_hook).is_some();
        }

        const GWLP_WNDPROC: i32 = -4;
        if ORIGINAL_WINDOW_PROC.load(Ordering::SeqCst) == 0 {
            let original = GetWindowLongPtrW(window, GWLP_WNDPROC);
            if original != 0 {
                ORIGINAL_WINDOW_PROC.store(original, Ordering::SeqCst);
                SetWindowLongPtrW(window, GWLP_WNDPROC, hooked_window_proc as isize);
                installed = true;
            }
        }

        installed
    }

    #[cfg(not(windows))]
    {
        let _ = window;
        false
    }
}

#[cfg(windows)]
unsafe extern "system" fn hooked_show_window(hwnd: isize, mut command: i32) -> i32 {
    const SW_SHOWNOACTIVATE: i32 = 4;
    const SW_SHOW: i32 = 5;
    const SW_SHOWNA: i32 = 8;

    if hwnd == MAIN_WINDOW_HANDLE.load(Ordering::SeqCst)
        && (command == SW_SHOWNOACTIVATE || command == SW_SHOW)
    {
        command = SW_SHOWNA;
    }

    unsafe {
        call_silent_original(&raw mut SILENT_SHOW_WINDOW_HOOK, |target| {
            let original: unsafe extern "system" fn(isize, i32) -> i32 =
                std::mem::transmute(target);
            original(hwnd, command)
        })
        .unwrap_or(0)
    }
}

#[cfg(windows)]
unsafe extern "system" fn hooked_set_window_pos(
    hwnd: isize,
    insert_after: isize,
    x: i32,
    y: i32,
    cx: i32,
    cy: i32,
    flags: u32,
) -> i32 {
    const HWND_TOPMOST: isize = -1;

    if hwnd == MAIN_WINDOW_HANDLE.load(Ordering::SeqCst) && insert_after == HWND_TOPMOST {
        return 1;
    }

    unsafe {
        call_silent_original(&raw mut SILENT_SET_WINDOW_POS_HOOK, |target| {
            let original: unsafe extern "system" fn(isize, isize, i32, i32, i32, i32, u32) -> i32 =
                std::mem::transmute(target);
            original(hwnd, insert_after, x, y, cx, cy, flags)
        })
        .unwrap_or(0)
    }
}

#[cfg(windows)]
unsafe extern "system" fn hooked_window_proc(
    hwnd: isize,
    message: u32,
    wparam: usize,
    lparam: isize,
) -> isize {
    const WM_WINDOWPOSCHANGING: u32 = 0x0046;
    const HWND_TOPMOST: isize = -1;

    if hwnd == MAIN_WINDOW_HANDLE.load(Ordering::SeqCst)
        && message == WM_WINDOWPOSCHANGING
        && lparam != 0
    {
        let window_pos = lparam as *mut WindowPos;
        if unsafe { (*window_pos).insert_after == HWND_TOPMOST } {
            unsafe { (*window_pos).insert_after = 0 };
            return 1;
        }
    }

    let original = ORIGINAL_WINDOW_PROC.load(Ordering::SeqCst);
    if original == 0 {
        return 0;
    }

    unsafe { CallWindowProcW(original, hwnd, message, wparam, lparam) }
}

#[cfg(windows)]
unsafe fn call_silent_original<F, R>(
    hook_slot: *mut Option<crate::hook::InlineHook>,
    call: F,
) -> Option<R>
where
    F: FnOnce(*mut c_void) -> R,
{
    let hook = unsafe { (*hook_slot).as_mut()? };
    Some(unsafe { hook.call_original(call) })
}

fn apply_native_window_vibrancy(window: isize, kind: u32, state: u32) -> bool {
    #[cfg(windows)]
    unsafe {
        clear_native_window_vibrancy(window);

        let success = match kind {
            0 => set_accent_policy(window, 2, state),
            1 => set_accent_policy(window, 3, state),
            2 | 3 => set_accent_policy(window, 4, state),
            4 => {
                if windows_build() >= 22000 {
                    let (attribute, value) = mica_attribute_and_value(state, windows_build());
                    extend_client_area(window, -1);
                    set_window_attribute(window, attribute, value)
                } else {
                    false
                }
            }
            _ => false,
        };

        if success {
            SetPropA(window, b"BackdropType\0".as_ptr(), (kind + 1) as isize) != 0
        } else {
            false
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (window, kind, state);
        false
    }
}

fn clear_native_window_vibrancy(window: isize) -> bool {
    #[cfg(windows)]
    unsafe {
        let value = RemovePropA(window, b"BackdropType\0".as_ptr());
        if value == 0 {
            return false;
        }

        match (value - 1) as u32 {
            0..=3 => set_accent_policy(window, 0, 0),
            4 if windows_build() >= 22000 => {
                extend_client_area(window, 1);
                let build = windows_build();
                let attribute = if build >= 22523 { 38 } else { 1029 };
                let value = if build >= 22523 { 1 } else { 0 };
                set_window_attribute(window, attribute, value)
            }
            _ => false,
        }
    }

    #[cfg(not(windows))]
    {
        let _ = window;
        false
    }
}

#[cfg(windows)]
fn windows_build() -> u32 {
    let mut version = OsVersionInfoExW {
        size: std::mem::size_of::<OsVersionInfoExW>() as u32,
        major_version: 0,
        minor_version: 0,
        build_number: 0,
        platform_id: 0,
        csd_version: [0; 128],
        service_pack_major: 0,
        service_pack_minor: 0,
        suite_mask: 0,
        product_type: 0,
        reserved: 0,
    };

    unsafe {
        if RtlGetVersion(&mut version) == 0 {
            version.build_number
        } else {
            0
        }
    }
}

#[cfg(windows)]
fn extend_client_area(window: isize, inset: i32) -> bool {
    let margins = if inset > 0 {
        Margins {
            left_width: 0,
            right_width: 0,
            top_height: inset,
            bottom_height: 0,
        }
    } else {
        Margins {
            left_width: inset,
            right_width: inset,
            top_height: inset,
            bottom_height: inset,
        }
    };

    unsafe { DwmExtendFrameIntoClientArea(window, &margins) == 0 }
}

#[cfg(windows)]
fn set_window_attribute(window: isize, attribute: u32, value: u32) -> bool {
    unsafe {
        DwmSetWindowAttribute(
            window,
            attribute,
            (&value as *const u32).cast::<c_void>(),
            std::mem::size_of::<u32>() as u32,
        ) == 0
    }
}

#[cfg(windows)]
fn set_accent_policy(window: isize, state: u32, mut color: u32) -> bool {
    const WCA_ACCENT_POLICY: u32 = 0x13;
    const ACCENT_ENABLE_ACRYLICBLURBEHIND: u32 = 4;

    if state == ACCENT_ENABLE_ACRYLICBLURBEHIND && ((color >> 24) & 0xff) == 0 {
        color |= 1 << 24;
    }

    let mut policy = AccentPolicy {
        state,
        flags: if state == ACCENT_ENABLE_ACRYLICBLURBEHIND {
            0
        } else {
            2
        },
        gradient_color: color,
        animation_id: 0,
    };
    let data = WindowCompositionAttribData {
        attrib: WCA_ACCENT_POLICY,
        data: (&mut policy as *mut AccentPolicy).cast::<c_void>(),
        data_size: std::mem::size_of::<AccentPolicy>() as u32,
    };

    type SetWindowCompositionAttribute =
        unsafe extern "system" fn(isize, *const WindowCompositionAttribData) -> i32;

    let Some(user32) = crate::dylib::find_lib("user32.dll") else {
        return false;
    };
    let Some(proc) = crate::dylib::find_proc(user32, "SetWindowCompositionAttribute") else {
        return false;
    };
    let set_window_composition_attribute: SetWindowCompositionAttribute =
        unsafe { std::mem::transmute(proc) };

    unsafe { set_window_composition_attribute(window, &data) != 0 }
}

#[cfg(windows)]
fn mica_attribute_and_value(state: u32, build: u32) -> (u32, u32) {
    if build >= 22523 {
        (38, state)
    } else {
        (1029, 2)
    }
}

unsafe fn focused_frame_url(browser: *mut CefBrowserPrefix) -> Option<String> {
    let get_focused_frame = unsafe { (*browser).get_focused_frame }?;
    let frame = unsafe { get_focused_frame(browser) };
    if frame.is_null() {
        return None;
    }

    let url = unsafe { frame_url(frame) };
    unsafe { release_ref_counted(&mut (*frame).base) };
    url
}

unsafe fn release_ref_counted(base: *mut CefBaseRefCounted) {
    if base.is_null() {
        return;
    }
    if let Some(release) = unsafe { (*base).release } {
        unsafe { release(base) };
    }
}

pub fn process_message_create(name: &str) -> *mut CefProcessMessagePrefix {
    type CreateMessage = unsafe extern "C" fn(*const CefString) -> *mut CefProcessMessagePrefix;

    let Some(proc) = libcef_proc("cef_process_message_create") else {
        return std::ptr::null_mut();
    };
    let create: CreateMessage = unsafe { std::mem::transmute(proc) };
    let name = CefString::leaked(name);
    unsafe { create(&name) }
}

pub unsafe fn frame_send_process_message(
    frame: *mut CefFramePrefix,
    target_process: i32,
    message: *mut CefProcessMessagePrefix,
) -> bool {
    if frame.is_null() || message.is_null() {
        return false;
    }

    unsafe {
        (*frame).send_process_message.is_some_and(|send| {
            send(frame, target_process, message);
            true
        })
    }
}

pub unsafe fn v8_context_global(context: *mut c_void) -> *mut CefV8Value {
    if context.is_null() {
        return std::ptr::null_mut();
    }

    let context = context.cast::<CefV8ContextPrefix>();
    unsafe {
        (*context)
            .get_global
            .map(|get_global| get_global(context))
            .unwrap_or(std::ptr::null_mut())
    }
}

pub unsafe fn v8_context_enter(context: *mut c_void) -> bool {
    if context.is_null() {
        return false;
    }

    let context = context.cast::<CefV8ContextPrefix>();
    unsafe { (*context).enter.is_none_or(|enter| enter(context) != 0) }
}

pub unsafe fn v8_context_exit(context: *mut c_void) {
    if context.is_null() {
        return;
    }

    let context = context.cast::<CefV8ContextPrefix>();
    unsafe {
        if let Some(exit) = (*context).exit {
            exit(context);
        }
    }
}

pub fn v8_current_context() -> *mut CefV8ContextPrefix {
    type CurrentContext = unsafe extern "C" fn() -> *mut CefV8ContextPrefix;

    let Some(proc) = libcef_proc("cef_v8context_get_current_context") else {
        return std::ptr::null_mut();
    };
    let current: CurrentContext = unsafe { std::mem::transmute(proc) };
    unsafe { current() }
}

pub unsafe fn v8_context_frame(context: *mut CefV8ContextPrefix) -> *mut CefFramePrefix {
    if context.is_null() {
        return std::ptr::null_mut();
    }

    type GetFrame = unsafe extern "system" fn(*mut CefV8ContextPrefix) -> *mut CefFramePrefix;
    let get_frame = unsafe { (*context).get_frame };
    if get_frame.is_null() {
        return std::ptr::null_mut();
    }

    let get_frame: GetFrame = unsafe { std::mem::transmute(get_frame) };
    unsafe { get_frame(context) }
}

pub unsafe fn v8_set_value_bykey(
    object: *mut CefV8Value,
    key: &str,
    value: *mut CefV8Value,
    attribute: i32,
) -> bool {
    if object.is_null() || value.is_null() {
        return false;
    }

    let key = CefString::leaked(key);
    unsafe {
        (*object)
            .set_value_bykey
            .is_some_and(|set| set(object, &key, value, attribute) != 0)
    }
}

pub unsafe fn v8_string_value(value: *mut CefV8Value) -> Option<String> {
    if value.is_null() {
        return None;
    }

    let is_string = unsafe { (*value).is_string }?;
    if unsafe { is_string(value) } == 0 {
        return None;
    }

    let get_string = unsafe { (*value).get_string_value }?;
    let string = unsafe { get_string(value) };
    let result = unsafe { cef_string_to_string(string) };
    unsafe { cef_userfree_utf16_free(string) };
    result
}

pub unsafe fn v8_bool_value(value: *mut CefV8Value) -> Option<bool> {
    if value.is_null() {
        return None;
    }

    let get_bool = unsafe { (*value).get_bool_value }?;
    Some(unsafe { get_bool(value) != 0 })
}

pub unsafe fn v8_double_value(value: *mut CefV8Value) -> Option<f64> {
    if value.is_null() {
        return None;
    }

    let get_double = unsafe { (*value).get_double_value }?;
    Some(unsafe { get_double(value) })
}

pub unsafe fn v8_is_null(value: *mut CefV8Value) -> bool {
    if value.is_null() {
        return true;
    }

    unsafe { (*value).is_null.is_some_and(|is_null| is_null(value) != 0) }
}

pub fn v8_create_string(value: &str) -> *mut CefV8Value {
    type CreateString = unsafe extern "C" fn(*const CefString) -> *mut CefV8Value;

    let Some(proc) = libcef_proc("cef_v8value_create_string") else {
        return std::ptr::null_mut();
    };
    let create: CreateString = unsafe { std::mem::transmute(proc) };
    let value = CefString::leaked(value);
    unsafe { create(&value) }
}

pub fn v8_create_bool(value: bool) -> *mut CefV8Value {
    type CreateBool = unsafe extern "C" fn(i32) -> *mut CefV8Value;

    let Some(proc) = libcef_proc("cef_v8value_create_bool") else {
        return std::ptr::null_mut();
    };
    let create: CreateBool = unsafe { std::mem::transmute(proc) };
    unsafe { create(i32::from(value)) }
}

pub fn v8_create_object() -> *mut CefV8Value {
    type CreateObject = unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut CefV8Value;

    let Some(proc) = libcef_proc("cef_v8value_create_object") else {
        return std::ptr::null_mut();
    };
    let create: CreateObject = unsafe { std::mem::transmute(proc) };
    unsafe { create(std::ptr::null_mut(), std::ptr::null_mut()) }
}

pub fn v8_create_function(name: &str, handler: *mut CefV8Handler) -> *mut CefV8Value {
    type CreateFunction =
        unsafe extern "C" fn(*const CefString, *mut CefV8Handler) -> *mut CefV8Value;

    if handler.is_null() {
        return std::ptr::null_mut();
    }

    let Some(proc) = libcef_proc("cef_v8value_create_function") else {
        return std::ptr::null_mut();
    };
    let create: CreateFunction = unsafe { std::mem::transmute(proc) };
    let name = CefString::leaked(name);
    unsafe { create(&name, handler) }
}

unsafe fn cef_string_to_string(value: *const CefString) -> Option<String> {
    if value.is_null() {
        return None;
    }

    let value = unsafe { &*value };
    if value.str_.is_null() {
        return None;
    }

    let data = unsafe { std::slice::from_raw_parts(value.str_, value.length) };
    Some(String::from_utf16_lossy(data))
}

fn libcef_proc(name: &str) -> Option<*mut c_void> {
    let libcef = crate::dylib::find_lib("libcef.dll")?;
    crate::dylib::find_proc(libcef, name)
}

unsafe fn cef_userfree_utf16_free(value: *mut CefString) {
    if value.is_null() {
        return;
    }

    type Free = unsafe extern "C" fn(*mut CefString);
    let Some(libcef) = crate::dylib::find_lib("libcef.dll") else {
        return;
    };
    let Some(proc) = crate::dylib::find_proc(libcef, "cef_string_userfree_utf16_free") else {
        return;
    };
    let free: Free = unsafe { std::mem::transmute(proc) };
    unsafe { free(value) };
}

fn resource_handler(response: crate::assets::AssetResponse) -> *mut CefResourceHandler {
    let read_limit = response.body.len();
    Box::into_raw(Box::new(CefResourceHandler {
        base: CefBaseRefCounted {
            size: std::mem::size_of::<CefResourceHandler>(),
            add_ref: Some(handler_add_ref),
            release: Some(handler_release),
            has_one_ref: Some(handler_has_one_ref),
            has_at_least_one_ref: Some(handler_has_at_least_one_ref),
        },
        open: Some(handler_open),
        process_request: Some(handler_process_request),
        get_response_headers: Some(handler_get_response_headers),
        skip: Some(handler_skip),
        read: Some(handler_read),
        read_response: Some(handler_read),
        cancel: Some(handler_cancel),
        ref_count: AtomicUsize::new(1),
        response,
        cursor: 0,
        read_limit,
        range_requested: false,
        range: None,
    }))
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum AssetRangeStatus {
    Full,
    Partial(crate::assets::AssetRange),
    Invalid,
}

impl AssetRangeStatus {
    fn status_code(&self) -> i32 {
        match self {
            Self::Full => 200,
            Self::Partial(_) => 206,
            Self::Invalid => 416,
        }
    }

    fn status_text(&self) -> &'static str {
        match self {
            Self::Full => "OK",
            Self::Partial(_) => "Partial Content",
            Self::Invalid => "Requested Range Not Satisfiable",
        }
    }
}

fn asset_range_status(handler: *mut CefResourceHandler) -> AssetRangeStatus {
    if handler.is_null() {
        return AssetRangeStatus::Full;
    }

    unsafe {
        match ((*handler).range_requested, (*handler).range.clone()) {
            (_, Some(range)) => AssetRangeStatus::Partial(range),
            (true, None) => AssetRangeStatus::Invalid,
            (false, None) => AssetRangeStatus::Full,
        }
    }
}

unsafe extern "system" fn riot_handler_add_ref(base: *mut CefBaseRefCounted) {
    if !base.is_null() {
        unsafe {
            (*(base as *mut CefRiotClientResourceHandler))
                .ref_count
                .fetch_add(1, Ordering::Relaxed)
        };
    }
}

unsafe extern "system" fn riot_handler_release(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    let handler = base as *mut CefRiotClientResourceHandler;
    if unsafe { (*handler).ref_count.fetch_sub(1, Ordering::Release) } == 1 {
        std::sync::atomic::fence(Ordering::Acquire);
        unsafe { drop(Box::from_raw(handler)) };
        1
    } else {
        0
    }
}

unsafe extern "system" fn riot_handler_has_one_ref(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    (unsafe {
        (*(base as *mut CefRiotClientResourceHandler))
            .ref_count
            .load(Ordering::Acquire)
    } == 1) as i32
}

unsafe extern "system" fn riot_handler_has_at_least_one_ref(base: *mut CefBaseRefCounted) -> i32 {
    if base.is_null() {
        return 0;
    }

    (unsafe {
        (*(base as *mut CefRiotClientResourceHandler))
            .ref_count
            .load(Ordering::Acquire)
    } >= 1) as i32
}

unsafe extern "system" fn riot_handler_open(
    handler: *mut CefRiotClientResourceHandler,
    request: *mut CefRequestPrefix,
    handle_request: *mut i32,
    callback: *mut CefCallbackPrefix,
) -> i32 {
    let _ = (handler, request, callback);
    if !handle_request.is_null() {
        unsafe { *handle_request = 0 };
    }
    0
}

unsafe extern "system" fn riot_handler_process_request(
    handler: *mut CefRiotClientResourceHandler,
    request: *mut CefRequestPrefix,
    callback: *mut CefCallbackPrefix,
) -> i32 {
    if handler.is_null() {
        return 0;
    }

    let rewritten_request = unsafe { rewritten_riotclient_request(request) };
    let Some((request, _proxy_url, target_url)) = rewritten_request else {
        crate::cef::record_riotclient_scheme_create(false);
        return 0;
    };

    let handler_ref = unsafe { &mut *handler };
    let client = riotclient_urlrequest_client(&mut handler_ref.data, callback);
    handler_ref.client = client;
    handler_ref.url_request =
        unsafe { launch_riotclient_urlrequest(handler_ref.frame, request, client) };
    let launched = !handler_ref.url_request.is_null();
    if launched {
        crate::cef::record_riotclient_proxy_request();
    }
    crate::cef::record_riotclient_scheme_create(!target_url.is_empty());

    i32::from(launched)
}

unsafe extern "system" fn riot_handler_get_response_headers(
    handler: *mut CefRiotClientResourceHandler,
    response: *mut CefResponsePrefix,
    response_length: *mut i64,
    redirect_url: *mut CefString,
) {
    let _ = redirect_url;
    if handler.is_null() || response.is_null() {
        return;
    }

    let handler_ref = unsafe { &mut *handler };
    if !handler_ref.url_request.is_null() {
        if let Some(get_response) = unsafe { (*handler_ref.url_request).get_response } {
            let upstream = unsafe { get_response(handler_ref.url_request) };
            if !upstream.is_null() {
                if let (Some(get_status), Some(set_status)) =
                    (unsafe { (*upstream).get_status }, unsafe {
                        (*response).set_status
                    })
                {
                    unsafe { set_status(response, get_status(upstream)) };
                }

                let headers = string_multimap_alloc();
                if !headers.is_null() {
                    if let Some(get_header_map) = unsafe { (*upstream).get_header_map } {
                        unsafe { get_header_map(upstream, headers) };
                    }
                    if let Some(set_header_map) = unsafe { (*response).set_header_map } {
                        unsafe { set_header_map(response, headers) };
                    }
                    unsafe { string_multimap_free(headers) };
                }
            }
        }
    }

    unsafe { set_header(response, "Access-Control-Allow-Origin", "*") };
    if !response_length.is_null() {
        let length = if handler_ref.client.is_null() {
            -1
        } else {
            unsafe {
                (*handler_ref.client)
                    .response_length
                    .load(Ordering::Acquire)
            }
        };
        unsafe { *response_length = length };
    }
}

unsafe extern "system" fn riot_handler_read(
    handler: *mut CefRiotClientResourceHandler,
    data_out: *mut c_void,
    bytes_to_read: i32,
    bytes_read: *mut i32,
    callback: *mut c_void,
) -> i32 {
    let _ = callback;
    if handler.is_null() || data_out.is_null() || bytes_to_read <= 0 {
        if !bytes_read.is_null() {
            unsafe { *bytes_read = 0 };
        }
        return 0;
    }

    let handler_ref = unsafe { &mut *handler };
    let done = !handler_ref.client.is_null()
        && unsafe { (*handler_ref.client).done.load(Ordering::Acquire) };
    let response_length = if handler_ref.client.is_null() {
        -1
    } else {
        unsafe {
            (*handler_ref.client)
                .response_length
                .load(Ordering::Acquire)
        }
    };

    if (response_length > 0 && handler_ref.bytes_read >= response_length as usize)
        || (handler_ref.bytes_read >= handler_ref.data.len() && done)
    {
        if !bytes_read.is_null() {
            unsafe { *bytes_read = 0 };
        }
        return 0;
    }

    let available = handler_ref
        .data
        .len()
        .saturating_sub(handler_ref.bytes_read);
    let to_copy = available.min(bytes_to_read as usize);
    if to_copy == 0 {
        if !bytes_read.is_null() {
            unsafe { *bytes_read = 0 };
        }
        return 1;
    }

    unsafe {
        std::ptr::copy_nonoverlapping(
            handler_ref.data.as_ptr().add(handler_ref.bytes_read),
            data_out.cast::<u8>(),
            to_copy,
        );
    }
    handler_ref.bytes_read += to_copy;

    if !bytes_read.is_null() {
        unsafe { *bytes_read = to_copy as i32 };
    }
    1
}

unsafe extern "system" fn riot_handler_cancel(handler: *mut CefRiotClientResourceHandler) {
    if handler.is_null() {
        return;
    }
    let url_request = unsafe { (*handler).url_request };
    if !url_request.is_null() {
        unsafe {
            if let Some(cancel) = (*url_request).cancel {
                cancel(url_request);
            }
        }
    }
}

fn riotclient_resource_handler(frame: *mut CefFramePrefix) -> *mut CefRiotClientResourceHandler {
    Box::into_raw(Box::new(CefRiotClientResourceHandler {
        base: CefBaseRefCounted {
            size: std::mem::size_of::<CefRiotClientResourceHandler>(),
            add_ref: Some(riot_handler_add_ref),
            release: Some(riot_handler_release),
            has_one_ref: Some(riot_handler_has_one_ref),
            has_at_least_one_ref: Some(riot_handler_has_at_least_one_ref),
        },
        open: Some(riot_handler_open),
        process_request: Some(riot_handler_process_request),
        get_response_headers: Some(riot_handler_get_response_headers),
        skip: std::ptr::null_mut(),
        read: Some(riot_handler_read),
        read_response: Some(riot_handler_read),
        cancel: Some(riot_handler_cancel),
        ref_count: AtomicUsize::new(1),
        frame,
        url_request: std::ptr::null_mut(),
        client: std::ptr::null_mut(),
        data: Vec::new(),
        bytes_read: 0,
    }))
}

unsafe extern "system" fn create_plugins_resource_handler(
    factory: *mut CefSchemeHandlerFactory,
    browser: *mut c_void,
    frame: *mut c_void,
    scheme_name: *const CefString,
    request: *mut c_void,
) -> *mut c_void {
    let _ = (factory, browser, frame, scheme_name);
    crate::cef::record_plugins_scheme_create();

    let request = request.cast::<CefRequestPrefix>();
    let Some(url) = (unsafe { request_url(request) }) else {
        return std::ptr::null_mut();
    };
    let accept = unsafe { request_header_by_name(request, "Accept") };
    let script_request = crate::assets::should_wrap_plugins_url(&url, accept.as_deref());

    if let Some(asset) = crate::assets::resolve_plugins_url(&url, script_request)
        .ok()
        .flatten()
    {
        crate::cef::record_plugins_asset_resolve();
        return resource_handler(asset).cast();
    }

    std::ptr::null_mut()
}

unsafe extern "system" fn create_riotclient_resource_handler(
    factory: *mut CefSchemeHandlerFactory,
    browser: *mut c_void,
    frame: *mut c_void,
    scheme_name: *const CefString,
    request: *mut c_void,
) -> *mut c_void {
    let _ = (factory, browser, scheme_name, request);
    riotclient_resource_handler(frame.cast()).cast()
}

pub fn plugins_scheme_factory() -> *mut CefSchemeHandlerFactory {
    scheme_factory(create_plugins_resource_handler)
}

pub fn riotclient_scheme_factory() -> *mut CefSchemeHandlerFactory {
    scheme_factory(create_riotclient_resource_handler)
}

fn scheme_factory(
    create: unsafe extern "system" fn(
        *mut CefSchemeHandlerFactory,
        *mut c_void,
        *mut c_void,
        *const CefString,
        *mut c_void,
    ) -> *mut c_void,
) -> *mut CefSchemeHandlerFactory {
    Box::into_raw(Box::new(CefSchemeHandlerFactory {
        base: CefBaseRefCounted {
            size: std::mem::size_of::<CefSchemeHandlerFactory>(),
            add_ref: Some(factory_add_ref),
            release: Some(factory_release),
            has_one_ref: Some(factory_has_one_ref),
            has_at_least_one_ref: Some(factory_has_at_least_one_ref),
        },
        create: Some(create),
    }))
}

pub unsafe fn register_plugins_scheme(context: *mut c_void) -> bool {
    if context.is_null() {
        return false;
    }

    let context = context.cast::<CefRequestContextPrefix>();
    let scheme = CefString::leaked("https");
    let domain = CefString::leaked("plugins");
    let factory = plugins_scheme_factory();

    unsafe {
        (*context)
            .register_scheme_handler_factory
            .is_some_and(|register| register(context, &scheme, &domain, factory) != 0)
    }
}

pub unsafe fn register_riotclient_scheme(context: *mut c_void) -> bool {
    if context.is_null() {
        return false;
    }

    let context = context.cast::<CefRequestContextPrefix>();
    let scheme = CefString::leaked("https");
    let domain = CefString::leaked("riotclient");
    let factory = riotclient_scheme_factory();

    unsafe {
        (*context)
            .register_scheme_handler_factory
            .is_some_and(|register| register(context, &scheme, &domain, factory) != 0)
    }
}

#[repr(C)]
pub struct CefApp {
    pub base: CefBaseRefCounted,
    pub on_before_command_line_processing: Option<OnBeforeCommandLineProcessing>,
    pub on_register_custom_schemes: *mut c_void,
    pub get_resource_bundle_handler: *mut c_void,
    pub get_browser_process_handler: *mut c_void,
    pub get_render_process_handler: Option<GetRenderProcessHandler>,
}

#[repr(C)]
pub struct CefCommandLine {
    pub base: CefBaseRefCounted,
    pub is_valid: *mut c_void,
    pub is_read_only: *mut c_void,
    pub copy: *mut c_void,
    pub init_from_argv: *mut c_void,
    pub init_from_string: Option<unsafe extern "system" fn(*mut CefCommandLine, *const CefString)>,
    pub reset: Option<unsafe extern "system" fn(*mut CefCommandLine)>,
    pub get_argv: *mut c_void,
    pub get_command_line_string:
        Option<unsafe extern "system" fn(*mut CefCommandLine) -> *mut CefString>,
    pub get_program: *mut c_void,
    pub set_program: *mut c_void,
    pub has_switches: *mut c_void,
    pub has_switch: *mut c_void,
    pub get_switch_value:
        Option<unsafe extern "system" fn(*mut CefCommandLine, *const CefString) -> *mut CefString>,
    pub get_switches: *mut c_void,
    pub append_switch: Option<unsafe extern "system" fn(*mut CefCommandLine, *const CefString)>,
    pub append_switch_with_value:
        Option<unsafe extern "system" fn(*mut CefCommandLine, *const CefString, *const CefString)>,
    pub has_arguments: *mut c_void,
    pub get_arguments: *mut c_void,
    pub append_argument: *mut c_void,
    pub prepend_wrapper: *mut c_void,
}

#[repr(C)]
pub struct CefSettingsPrefix {
    pub size: usize,
    pub no_sandbox: i32,
    pub browser_subprocess_path: CefString,
    pub framework_dir_path: CefString,
    pub main_bundle_path: CefString,
    pub chrome_runtime: i32,
    pub multi_threaded_message_loop: i32,
    pub external_message_pump: i32,
    pub windowless_rendering_enabled: i32,
    pub command_line_args_disabled: i32,
    pub cache_path: CefString,
    pub root_cache_path: CefString,
}

#[repr(C)]
pub struct CefRequestContextSettingsPrefix {
    pub size: usize,
    pub cache_path: CefString,
}

pub unsafe fn append_switch(command_line: *mut CefCommandLine, name: &str) {
    if command_line.is_null() {
        return;
    }

    let name = CefString::leaked(name);
    if let Some(append) = unsafe { (*command_line).append_switch } {
        unsafe { append(command_line, &name) };
    }
}

pub unsafe fn command_line_string(command_line: *mut CefCommandLine) -> Option<String> {
    if command_line.is_null() {
        return None;
    }

    let get_command_line_string = unsafe { (*command_line).get_command_line_string }?;
    let value = unsafe { get_command_line_string(command_line) };
    let result = unsafe { cef_string_to_string(value) };
    unsafe { cef_userfree_utf16_free(value) };
    result
}

pub unsafe fn reset_command_line_from_string(
    command_line: *mut CefCommandLine,
    value: &str,
) -> bool {
    if command_line.is_null() {
        return false;
    }

    let Some(reset) = (unsafe { (*command_line).reset }) else {
        return false;
    };
    let Some(init_from_string) = (unsafe { (*command_line).init_from_string }) else {
        return false;
    };

    let value = CefString::leaked(value);
    unsafe {
        reset(command_line);
        init_from_string(command_line, &value);
    }
    true
}

pub unsafe fn append_switch_with_value(command_line: *mut CefCommandLine, name: &str, value: &str) {
    if command_line.is_null() {
        return;
    }

    let name = CefString::leaked(name);
    let value = CefString::leaked(value);
    if let Some(append) = unsafe { (*command_line).append_switch_with_value } {
        unsafe { append(command_line, &name, &value) };
    }
}

pub unsafe fn switch_value(command_line: *mut CefCommandLine, name: &str) -> Option<String> {
    if command_line.is_null() {
        return None;
    }

    let name = CefString::leaked(name);
    let get_switch_value = unsafe { (*command_line).get_switch_value }?;
    let value = unsafe { get_switch_value(command_line, &name) };
    let result = unsafe { cef_string_to_string(value) };
    unsafe { cef_userfree_utf16_free(value) };
    result.filter(|value| !value.is_empty())
}

pub unsafe fn set_settings_cache_paths(settings: *const std::ffi::c_void, cache_path: &str) {
    if settings.is_null() {
        return;
    }

    let settings = settings as *mut CefSettingsPrefix;
    unsafe {
        (*settings).cache_path = CefString::leaked(cache_path);
        (*settings).root_cache_path = CefString::leaked(cache_path);
    }
}

pub unsafe fn set_request_context_cache_path(settings: *const std::ffi::c_void, cache_path: &str) {
    if settings.is_null() {
        return;
    }

    let settings = settings as *mut CefRequestContextSettingsPrefix;
    unsafe {
        (*settings).cache_path = CefString::leaked(cache_path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    static RECORDED_RESPONSE_HEADERS: OnceLock<Mutex<Vec<(String, String)>>> = OnceLock::new();

    unsafe extern "system" fn record_response_header(
        _response: *mut CefResponsePrefix,
        name: *const CefString,
        value: *const CefString,
        _overwrite: i32,
    ) {
        let headers = RECORDED_RESPONSE_HEADERS.get_or_init(|| Mutex::new(Vec::new()));
        headers.lock().unwrap().push((
            unsafe { cef_string_to_string(name) }.unwrap_or_default(),
            unsafe { cef_string_to_string(value) }.unwrap_or_default(),
        ));
    }

    fn test_response_recorder() -> CefResponsePrefix {
        CefResponsePrefix {
            base: CefBaseRefCounted {
                size: std::mem::size_of::<CefResponsePrefix>(),
                add_ref: None,
                release: None,
                has_one_ref: None,
                has_at_least_one_ref: None,
            },
            is_read_only: std::ptr::null_mut(),
            get_error: std::ptr::null_mut(),
            set_error: std::ptr::null_mut(),
            get_status: None,
            set_status: None,
            get_status_text: std::ptr::null_mut(),
            set_status_text: None,
            get_mime_type: std::ptr::null_mut(),
            set_mime_type: None,
            get_charset: std::ptr::null_mut(),
            set_charset: None,
            get_header_by_name: std::ptr::null_mut(),
            set_header_by_name: Some(record_response_header),
            get_header_map: None,
            set_header_map: None,
        }
    }

    fn test_asset_response() -> crate::assets::AssetResponse {
        crate::assets::AssetResponse {
            path: std::path::PathBuf::from("asset.bin"),
            body: vec![0, 1, 2, 3, 4, 5],
            mime: "application/octet-stream".into(),
            no_cache: false,
            etag: "\"00000000\"".into(),
        }
    }

    #[test]
    fn asset_range_status_distinguishes_invalid_requested_ranges() {
        let handler = resource_handler(test_asset_response());

        assert_eq!(asset_range_status(handler), AssetRangeStatus::Full);

        unsafe {
            (*handler).range_requested = true;
            (*handler).range = crate::assets::parse_range_header("bytes=2-4", 6);
        }
        assert_eq!(
            asset_range_status(handler),
            AssetRangeStatus::Partial(crate::assets::AssetRange {
                start: 2,
                end: 4,
                content_length: 3,
                content_range: "bytes 2-4/6".into(),
            })
        );

        unsafe {
            (*handler).range = crate::assets::parse_range_header("bytes=8-9", 6);
        }
        let invalid = asset_range_status(handler);
        assert_eq!(invalid.status_code(), 416);
        assert_eq!(invalid.status_text(), "Requested Range Not Satisfiable");

        unsafe {
            drop(Box::from_raw(handler));
        }
    }

    #[test]
    fn asset_response_headers_include_upstream_cors_and_cache_headers() {
        let headers = RECORDED_RESPONSE_HEADERS.get_or_init(|| Mutex::new(Vec::new()));
        headers.lock().unwrap().clear();
        let handler = resource_handler(test_asset_response());
        let mut response = test_response_recorder();
        let mut response_length = 0;

        unsafe {
            handler_get_response_headers(
                handler,
                &mut response,
                &mut response_length,
                std::ptr::null_mut(),
            );
            drop(Box::from_raw(handler));
        }

        let headers = headers.lock().unwrap();
        assert!(
            headers
                .iter()
                .any(|header| header == &("Access-Control-Allow-Origin".into(), "*".into()))
        );
        assert!(headers.iter().any(
            |header| header == &("Cache-Control".into(), "max-age=31536000, immutable".into())
        ));
        assert!(
            headers
                .iter()
                .any(|header| header == &("ETag".into(), "\"00000000\"".into()))
        );
        assert_eq!(response_length, 6);
    }

    #[test]
    fn request_context_register_factory_offset_matches_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefRequestContextPrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let field = unsafe {
            std::ptr::addr_of!((*uninit.as_ptr()).register_scheme_handler_factory) as usize
        };

        assert_eq!(
            field - base,
            std::mem::size_of::<CefBaseRefCounted>() + (11 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn command_line_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefCommandLine>::uninit();
        let base = uninit.as_ptr() as usize;
        let init_from_string =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).init_from_string) as usize };
        let reset = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).reset) as usize };
        let get_command_line_string =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_command_line_string) as usize };
        let get_switch_value =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_switch_value) as usize };

        assert_eq!(
            init_from_string - base,
            std::mem::size_of::<CefBaseRefCounted>() + (4 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            reset - base,
            std::mem::size_of::<CefBaseRefCounted>() + (5 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_command_line_string - base,
            std::mem::size_of::<CefBaseRefCounted>() + (7 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_switch_value - base,
            std::mem::size_of::<CefBaseRefCounted>() + (12 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn request_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefRequestPrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let get_method = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_method) as usize };
        let get_post_data =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_post_data) as usize };
        let set_header_by_name =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).set_header_by_name) as usize };
        let set = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).set) as usize };

        assert_eq!(
            get_method - base,
            std::mem::size_of::<CefBaseRefCounted>() + (3 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_post_data - base,
            std::mem::size_of::<CefBaseRefCounted>() + (8 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            set_header_by_name - base,
            std::mem::size_of::<CefBaseRefCounted>() + (13 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            set - base,
            std::mem::size_of::<CefBaseRefCounted>() + (14 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn render_handler_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefRenderProcessHandler>::uninit();
        let base = uninit.as_ptr() as usize;
        let on_browser_created =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).on_browser_created) as usize };
        let on_context_created =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).on_context_created) as usize };

        assert_eq!(
            on_browser_created - base,
            std::mem::size_of::<CefBaseRefCounted>() + std::mem::size_of::<usize>()
        );
        assert_eq!(
            on_context_created - base,
            std::mem::size_of::<CefBaseRefCounted>() + (4 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn frame_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefFramePrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let execute =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).execute_java_script) as usize };
        let get_url = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_url) as usize };
        let create_urlrequest =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).create_urlrequest) as usize };
        let send_process_message =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).send_process_message) as usize };

        assert_eq!(
            execute - base,
            std::mem::size_of::<CefBaseRefCounted>() + (13 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_url - base,
            std::mem::size_of::<CefBaseRefCounted>() + (19 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            create_urlrequest - base,
            std::mem::size_of::<CefBaseRefCounted>() + (23 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            send_process_message - base,
            std::mem::size_of::<CefBaseRefCounted>() + (24 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn urlrequest_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefUrlRequestPrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let get_request = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_request) as usize };
        let cancel = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).cancel) as usize };

        assert_eq!(get_request - base, std::mem::size_of::<CefBaseRefCounted>());
        assert_eq!(
            cancel - base,
            std::mem::size_of::<CefBaseRefCounted>() + (6 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn urlrequest_client_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefUrlRequestClient>::uninit();
        let base = uninit.as_ptr() as usize;
        let on_request_complete =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).on_request_complete) as usize };
        let get_auth_credentials =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_auth_credentials) as usize };

        assert_eq!(
            on_request_complete - base,
            std::mem::size_of::<CefBaseRefCounted>()
        );
        assert_eq!(
            get_auth_credentials - base,
            std::mem::size_of::<CefBaseRefCounted>() + (4 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn dictionary_has_key_offset_matches_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefDictionaryValuePrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let has_key = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).has_key) as usize };

        assert_eq!(
            has_key - base,
            std::mem::size_of::<CefBaseRefCounted>() + (8 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn v8_context_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefV8ContextPrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let get_global = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_global) as usize };
        let enter = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).enter) as usize };

        assert_eq!(
            get_global - base,
            std::mem::size_of::<CefBaseRefCounted>() + (4 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            enter - base,
            std::mem::size_of::<CefBaseRefCounted>() + (5 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn v8_value_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefV8Value>::uninit();
        let base = uninit.as_ptr() as usize;
        let get_bool_value =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_bool_value) as usize };
        let get_double_value =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_double_value) as usize };
        let get_string_value =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_string_value) as usize };
        let set_value_bykey =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).set_value_bykey) as usize };

        assert_eq!(
            get_bool_value - base,
            std::mem::size_of::<CefBaseRefCounted>() + (15 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_double_value - base,
            std::mem::size_of::<CefBaseRefCounted>() + (18 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_string_value - base,
            std::mem::size_of::<CefBaseRefCounted>() + (20 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            set_value_bykey - base,
            std::mem::size_of::<CefBaseRefCounted>() + (33 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn v8_handler_execute_offset_matches_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefV8Handler>::uninit();
        let base = uninit.as_ptr() as usize;
        let execute = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).execute) as usize };

        assert_eq!(execute - base, std::mem::size_of::<CefBaseRefCounted>());
    }

    #[test]
    fn client_message_offset_matches_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefClientPrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let get_keyboard_handler =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_keyboard_handler) as usize };
        let get_life_span_handler =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_life_span_handler) as usize };
        let on_process_message_received =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).on_process_message_received) as usize };

        assert_eq!(
            get_keyboard_handler - base,
            std::mem::size_of::<CefBaseRefCounted>() + (12 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_life_span_handler - base,
            std::mem::size_of::<CefBaseRefCounted>() + (13 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            on_process_message_received - base,
            std::mem::size_of::<CefBaseRefCounted>() + (18 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn keyboard_handler_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefKeyboardHandlerPrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let on_pre_key_event =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).on_pre_key_event) as usize };
        let on_key_event = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).on_key_event) as usize };

        assert_eq!(
            on_pre_key_event - base,
            std::mem::size_of::<CefBaseRefCounted>()
        );
        assert_eq!(
            on_key_event - base,
            std::mem::size_of::<CefBaseRefCounted>() + std::mem::size_of::<usize>()
        );
    }

    #[test]
    fn key_event_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefKeyEvent>::uninit();
        let base = uninit.as_ptr() as usize;
        let modifiers = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).modifiers) as usize };
        let windows_key_code =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).windows_key_code) as usize };
        let focus_on_editable_field =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).focus_on_editable_field) as usize };

        assert_eq!(modifiers - base, 4);
        assert_eq!(windows_key_code - base, 8);
        assert_eq!(focus_on_editable_field - base, 24);
    }

    #[test]
    fn life_span_handler_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefLifeSpanHandlerPrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let on_before_popup =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).on_before_popup) as usize };
        let on_after_created =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).on_after_created) as usize };

        assert_eq!(
            on_before_popup - base,
            std::mem::size_of::<CefBaseRefCounted>()
        );
        assert_eq!(
            on_after_created - base,
            std::mem::size_of::<CefBaseRefCounted>() + std::mem::size_of::<usize>()
        );
    }

    #[test]
    fn browser_reload_offset_matches_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefBrowserPrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let reload_ignore_cache =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).reload_ignore_cache) as usize };
        let get_identifier =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_identifier) as usize };
        let get_main_frame =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_main_frame) as usize };
        let get_focused_frame =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_focused_frame) as usize };

        assert_eq!(
            reload_ignore_cache - base,
            std::mem::size_of::<CefBaseRefCounted>() + (8 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_identifier - base,
            std::mem::size_of::<CefBaseRefCounted>() + (10 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_focused_frame - base,
            std::mem::size_of::<CefBaseRefCounted>() + (15 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_main_frame - base,
            std::mem::size_of::<CefBaseRefCounted>() + (14 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn browser_host_devtools_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefBrowserHostPrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let get_window_handle =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_window_handle) as usize };
        let show_dev_tools =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).show_dev_tools) as usize };

        assert_eq!(
            get_window_handle - base,
            std::mem::size_of::<CefBaseRefCounted>() + (4 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            show_dev_tools - base,
            std::mem::size_of::<CefBaseRefCounted>() + (18 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn process_message_name_offset_matches_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefProcessMessagePrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let get_name = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_name) as usize };
        let get_argument_list =
            unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_argument_list) as usize };

        assert_eq!(
            get_name - base,
            std::mem::size_of::<CefBaseRefCounted>() + (3 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_argument_list - base,
            std::mem::size_of::<CefBaseRefCounted>() + (4 * std::mem::size_of::<usize>())
        );
    }

    #[test]
    fn list_value_offsets_match_declared_prefix() {
        let uninit = std::mem::MaybeUninit::<CefListValuePrefix>::uninit();
        let base = uninit.as_ptr() as usize;
        let get_type = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_type) as usize };
        let get_bool = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_bool) as usize };
        let get_double = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).get_double) as usize };
        let set_null = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).set_null) as usize };
        let set_double = unsafe { std::ptr::addr_of!((*uninit.as_ptr()).set_double) as usize };

        assert_eq!(
            get_type - base,
            std::mem::size_of::<CefBaseRefCounted>() + (10 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_bool - base,
            std::mem::size_of::<CefBaseRefCounted>() + (12 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            get_double - base,
            std::mem::size_of::<CefBaseRefCounted>() + (14 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            set_null - base,
            std::mem::size_of::<CefBaseRefCounted>() + (20 * std::mem::size_of::<usize>())
        );
        assert_eq!(
            set_double - base,
            std::mem::size_of::<CefBaseRefCounted>() + (23 * std::mem::size_of::<usize>())
        );
    }

    #[cfg(windows)]
    #[test]
    fn mica_attribute_selection_matches_windows_build_shape() {
        assert_eq!(mica_attribute_and_value(4, 22621), (38, 4));
        assert_eq!(mica_attribute_and_value(4, 22000), (1029, 2));
    }
}
