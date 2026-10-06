"""Verify a packaged binary stays running; Linux requires xvfb-run."""
import pathlib, subprocess, sys, time, json
path = str(pathlib.Path(sys.argv[1]).resolve())
started = time.monotonic()
process = subprocess.Popen([path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
try:
    time.sleep(5)
    if process.poll() is not None:
        out, err = process.communicate()
        raise RuntimeError(f"Application exited early ({process.returncode}): {err.decode(errors='replace')}")
    print(json.dumps({"binary": path, "aliveAfterSeconds": round(time.monotonic()-started, 2)}))
finally:
    process.terminate()
    try: process.wait(timeout=10)
    except subprocess.TimeoutExpired: process.kill()
