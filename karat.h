// karat.h - C header for Karat DLL
// Karat v0.4.0 · developed by XySpace
#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#ifdef _WIN32
  #ifdef KARAT_EXPORTS
    #define KARAT_API __declspec(dllexport)
  #else
    #define KARAT_API __declspec(dllimport)
  #endif
#else
  #define KARAT_API
#endif

// Memory management - MUST call after using returned char*
KARAT_API void karat_free_string(char* s);

// Lifecycle
KARAT_API int karat_init();
KARAT_API void karat_shutdown();

// Info
KARAT_API char* karat_version(); // returns string, free with karat_free_string
KARAT_API char* karat_health();

// Filesystem - all return JSON string: {"ok":bool,"data":...} or {"ok":false,"error":...}
// root = absolute path to workspace root, rel = relative path inside workspace
KARAT_API char* karat_list_dir(const char* root, const char* rel);
KARAT_API char* karat_read_file(const char* root, const char* rel);
KARAT_API char* karat_save_file(const char* root, const char* rel, const char* content);
KARAT_API char* karat_make_dir(const char* root, const char* rel);
KARAT_API char* karat_delete_path(const char* root, const char* rel);
KARAT_API char* karat_rename_path(const char* root, const char* from, const char* to);
KARAT_API char* karat_search(const char* root, const char* rel, const char* query);

#ifdef __cplusplus
}
#endif
