#include <iostream>
#include <string>
#include <windows.h>

// Define function pointers
typedef char* (*karat_version_t)();
typedef char* (*karat_health_t)();
typedef char* (*karat_list_dir_t)(const char*, const char*);
typedef char* (*karat_read_file_t)(const char*, const char*);
typedef void (*karat_free_string_t)(char*);
typedef int (*karat_init_t)();

int main() {
    std::cout << "=== Karat DLL Test C++ ===" << std::endl;

    HMODULE hMod = LoadLibraryA("karat.dll");
    if (!hMod) {
        std::cerr << "Failed to load karat.dll, error: " << GetLastError() << std::endl;
        std::cerr << "Make sure karat.dll is in same folder or PATH" << std::endl;
        return 1;
    }

    auto karat_version = (karat_version_t)GetProcAddress(hMod, "karat_version");
    auto karat_health = (karat_health_t)GetProcAddress(hMod, "karat_health");
    auto karat_list_dir = (karat_list_dir_t)GetProcAddress(hMod, "karat_list_dir");
    auto karat_free_string = (karat_free_string_t)GetProcAddress(hMod, "karat_free_string");
    auto karat_init = (karat_init_t)GetProcAddress(hMod, "karat_init");

    if (!karat_version || !karat_free_string) {
        std::cerr << "Failed to get functions" << std::endl;
        return 1;
    }

    karat_init();

    char* ver = karat_version();
    std::cout << "Version: " << ver << std::endl;
    karat_free_string(ver);

    char* health = karat_health();
    std::cout << "Health: " << health << std::endl;
    karat_free_string(health);

    // List dir - adjust root path
    const char* root = "C:/path/to/karat"; // ganti dengan path project kamu
    // For demo use current dir
    root = ".";

    char* list = karat_list_dir(root, "");
    if (list) {
        std::string s(list);
        std::cout << "\nList (truncated 1000 chars):\n" << s.substr(0, 1000) << std::endl;
        karat_free_string(list);
    }

    FreeLibrary(hMod);
    std::cout << "\n✅ DLL works from C++!" << std::endl;
    return 0;
}
