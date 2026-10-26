"""Windows: re-enable Ctrl+C processing (inherited ignore flag), ignore it here, run the server, return its exit code."""
import ctypes, signal, subprocess, sys
ctypes.WinDLL("kernel32").SetConsoleCtrlHandler(None, False)
signal.signal(signal.SIGINT, signal.SIG_IGN)
sys.exit(subprocess.call(sys.argv[1:]))
