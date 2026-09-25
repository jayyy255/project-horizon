#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <iostream>
#include <vector>
#include <chrono>
#include <fstream>
#include <string>

#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "user32.lib")

struct MonitorInfo {
    int index;
    RECT rect;
    bool isPrimary;
    int dpi;
    std::wstring deviceName;
};

std::vector<MonitorInfo> g_monitors;

BOOL CALLBACK MonitorEnumProc(HMONITOR hMon, HDC hdc, LPRECT lprc, LPARAM pData) {
    MONITORINFOEXW mi;
    mi.cbSize = sizeof(MONITORINFOEXW);
    GetMonitorInfoW(hMon, &mi);

    UINT dpiX = 96, dpiY = 96;
    typedef HRESULT (WINAPI *GetDpiForMonitorProc)(HMONITOR, int, UINT*, UINT*);
    HMODULE shcore = LoadLibraryA("shcore.dll");
    if (shcore) {
        GetDpiForMonitorProc getDpi = (GetDpiForMonitorProc)GetProcAddress(shcore, "GetDpiForMonitor");
        if (getDpi) {
            getDpi(hMon, 0, &dpiX, &dpiY);
        }
        FreeLibrary(shcore);
    }

    MonitorInfo info;
    info.index = (int)g_monitors.size();
    info.rect = mi.rcMonitor;
    info.isPrimary = (mi.dwFlags & MONITORINFOF_PRIMARY) != 0;
    info.dpi = (int)dpiX;
    info.deviceName = mi.szDevice;
    g_monitors.push_back(info);
    return TRUE;
}

int main(int argc, char* argv[]) {
    // Set DPI awareness for accurate coordinates
    SetProcessDPIAware();

    std::string outputPath = "scratch/real_desktop_native_capture.bmp";
    if (argc > 1) {
        outputPath = argv[1];
    }

    g_monitors.clear();
    EnumDisplayMonitors(NULL, NULL, MonitorEnumProc, 0);

    auto t0 = std::chrono::high_resolution_clock::now();

    int vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
    int vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
    int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
    int vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);

    HDC hScreenDC = GetDC(NULL);
    HDC hMemDC = CreateCompatibleDC(hScreenDC);
    HBITMAP hBitmap = CreateCompatibleBitmap(hScreenDC, vw, vh);
    HBITMAP hOldBitmap = (HBITMAP)SelectObject(hMemDC, hBitmap);

    // Capture screen contents
    BitBlt(hMemDC, 0, 0, vw, vh, hScreenDC, vx, vy, SRCCOPY | CAPTUREBLT);

    auto tCaptureEnd = std::chrono::high_resolution_clock::now();
    double captureDurationMs = std::chrono::duration<double, std::milli>(tCaptureEnd - t0).count();

    // MUST deselect hBitmap before GetDIBits
    SelectObject(hMemDC, hOldBitmap);

    BITMAPINFO bi;
    ZeroMemory(&bi, sizeof(BITMAPINFO));
    bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bi.bmiHeader.biWidth = vw;
    bi.bmiHeader.biHeight = -vh; // Top-down
    bi.bmiHeader.biPlanes = 1;
    bi.bmiHeader.biBitCount = 32;
    bi.bmiHeader.biCompression = BI_RGB;

    DWORD dwBmpSize = vw * 4 * vh;
    std::vector<BYTE> buffer(dwBmpSize);

    int scanlines = GetDIBits(hScreenDC, hBitmap, 0, vh, buffer.data(), &bi, DIB_RGB_COLORS);

    // Set alpha to 255 for all pixels (opaque)
    for (size_t i = 3; i < buffer.size(); i += 4) {
        buffer[i] = 255;
    }

    BITMAPFILEHEADER bfh;
    bfh.bfType = 0x4D42; // "BM"
    bfh.bfSize = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER) + dwBmpSize;
    bfh.bfReserved1 = 0;
    bfh.bfReserved2 = 0;
    bfh.bfOffBits = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER);

    std::ofstream file(outputPath, std::ios::out | std::ios::binary);
    bool saved = false;
    if (file) {
        file.write((const char*)&bfh, sizeof(bfh));
        file.write((const char*)&bi.bmiHeader, sizeof(bi.bmiHeader));
        file.write((const char*)buffer.data(), dwBmpSize);
        saved = true;
    }

    auto tSaveEnd = std::chrono::high_resolution_clock::now();
    double totalDurationMs = std::chrono::duration<double, std::milli>(tSaveEnd - t0).count();

    DeleteObject(hBitmap);
    DeleteDC(hMemDC);
    ReleaseDC(NULL, hScreenDC);

    std::cout << "{\n";
    std::cout << "  \"success\": " << (saved && scanlines > 0 ? "true" : "false") << ",\n";
    std::cout << "  \"scanlines\": " << scanlines << ",\n";
    std::cout << "  \"captureMs\": " << captureDurationMs << ",\n";
    std::cout << "  \"totalMs\": " << totalDurationMs << ",\n";
    std::cout << "  \"virtualScreen\": { \"x\": " << vx << ", \"y\": " << vy << ", \"w\": " << vw << ", \"h\": " << vh << " },\n";
    std::cout << "  \"outputPath\": \"" << outputPath << "\",\n";
    std::cout << "  \"monitorCount\": " << g_monitors.size() << ",\n";
    std::cout << "  \"monitors\": [\n";
    for (size_t i = 0; i < g_monitors.size(); i++) {
        const auto& m = g_monitors[i];
        std::cout << "    {\n";
        std::cout << "      \"index\": " << m.index << ",\n";
        std::cout << "      \"isPrimary\": " << (m.isPrimary ? "true" : "false") << ",\n";
        std::cout << "      \"x\": " << m.rect.left << ",\n";
        std::cout << "      \"y\": " << m.rect.top << ",\n";
        std::cout << "      \"width\": " << (m.rect.right - m.rect.left) << ",\n";
        std::cout << "      \"height\": " << (m.rect.bottom - m.rect.top) << ",\n";
        std::cout << "      \"dpi\": " << m.dpi << "\n";
        std::cout << "    }" << (i + 1 < g_monitors.size() ? "," : "") << "\n";
    }
    std::cout << "  ]\n";
    std::cout << "}\n";

    return (saved && scanlines > 0) ? 0 : 1;
}
