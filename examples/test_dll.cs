using System;
using System.Runtime.InteropServices;

class KaratDLL
{
    const string DllName = "karat.dll"; // or full path

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr karat_version();

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr karat_health();

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr karat_list_dir(string root, string rel);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr karat_read_file(string root, string rel);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr karat_search(string root, string rel, string query);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern void karat_free_string(IntPtr s);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    public static extern int karat_init();

    static string PtrToStringAndFree(IntPtr ptr)
    {
        if (ptr == IntPtr.Zero) return null;
        string s = Marshal.PtrToStringUTF8(ptr);
        karat_free_string(ptr);
        return s;
    }

    static void Main(string[] args)
    {
        Console.WriteLine("=== Karat DLL Test C# ===");
        karat_init();

        var verPtr = karat_version();
        Console.WriteLine($"Version: {PtrToStringAndFree(verPtr)}");

        var healthPtr = karat_health();
        Console.WriteLine($"Health: {PtrToStringAndFree(healthPtr)}");

        string root = AppDomain.CurrentDomain.BaseDirectory + "../../../";
        root = System.IO.Path.GetFullPath(root);
        Console.WriteLine($"\nRoot: {root}");

        var listPtr = karat_list_dir(root, "");
        var listJson = PtrToStringAndFree(listPtr);
        Console.WriteLine($"\nList_dir result (truncated): {listJson?.Substring(0, Math.Min(1000, listJson.Length))}");

        var searchPtr = karat_search(root, "", "fn");
        var searchJson = PtrToStringAndFree(searchPtr);
        Console.WriteLine($"\nSearch result (truncated): {searchJson?.Substring(0, Math.Min(1000, searchJson.Length))}");

        Console.WriteLine("\n✅ DLL works from C#!");
    }
}
