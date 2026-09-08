"""
Test Karat DLL via ctypes (Windows) / cdll (Linux/macOS)
"""
import ctypes
import json
import os
import sys
from pathlib import Path

# Find library
def find_lib():
    candidates = [
        Path(__file__).parent.parent / "target" / "release" / "karat.dll",
        Path(__file__).parent.parent / "target" / "release" / "libkarat.so",
        Path(__file__).parent.parent / "target" / "release" / "libkarat.dylib",
        Path(__file__).parent.parent / "dist" / "karat.dll",
        Path(__file__).parent.parent / "dist" / "libkarat.so",
        Path(__file__).parent.parent / "dist" / "libkarat.dylib",
        Path("./karat.dll"),
        Path("./libkarat.so"),
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    return None

lib_path = find_lib()
if not lib_path:
    print("❌ DLL not found. Run cargo build --release --lib first")
    sys.exit(1)

print(f"Loading: {lib_path}")
karat = ctypes.CDLL(lib_path)

# Define signatures
karat.karat_version.restype = ctypes.c_void_p
karat.karat_health.restype = ctypes.c_void_p
karat.karat_list_dir.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
karat.karat_list_dir.restype = ctypes.c_void_p
karat.karat_read_file.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
karat.karat_read_file.restype = ctypes.c_void_p
karat.karat_search.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p]
karat.karat_search.restype = ctypes.c_void_p
karat.karat_free_string.argtypes = [ctypes.c_void_p]

def call_and_parse(ptr):
    if not ptr:
        return None
    s = ctypes.cast(ptr, ctypes.c_char_p).value.decode('utf-8')
    karat.karat_free_string(ptr)
    try:
        return json.loads(s)
    except:
        return s

# Test version
print("\n=== karat_version ===")
ver = call_and_parse(karat.karat_version())
print(ver)

print("\n=== karat_health ===")
health = call_and_parse(karat.karat_health())
print(health)

# Test list_dir - use current workspace
root = str(Path(__file__).parent.parent.absolute())
print(f"\n=== karat_list_dir root={root} ===")
ptr = karat.karat_list_dir(root.encode(), b"")
res = call_and_parse(ptr)
print(json.dumps(res, indent=2)[:2000])

# Test search
print("\n=== karat_search 'fn' ===")
ptr = karat.karat_search(root.encode(), b"", b"fn")
res = call_and_parse(ptr)
print(json.dumps(res, indent=2)[:2000])

print("\n✅ DLL works!")
