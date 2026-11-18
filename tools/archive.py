"""Archive completed visual recovery experiments; optionally watch and sync to Pages."""
import argparse
from datetime import datetime
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from zoneinfo import ZoneInfo

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / "docs/runs"
VIEWS = ("wrist", "belly", "top")
KNOWN = {"1794978326634233000": "Astra 6.2"}
TZ = ZoneInfo("Asia/Seoul")


def write_json(path, value):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(path)


def archive(trace):
    run_id = trace.name
    result = json.loads((trace / "score.json").read_text())
    commands = [json.loads(line) for line in (trace / "decisions.jsonl").read_text().splitlines()]
    if not commands or commands[-1]["action"] != "finish":
        return
    date = datetime.fromtimestamp(int(run_id) / 1e9, TZ).isoformat(timespec="seconds")
    model = KNOWN.get(run_id, "모델 미기록")
    started = datetime.fromisoformat(date).strftime("%Y.%m.%d %H:%M")
    meta = dict(id=run_id, date=date, model=model, title="낙하 후 블록 재파지", label=started+" KST")
    outfile = RUNS / run_id
    if not outfile.exists():
        with tempfile.TemporaryDirectory(dir=RUNS) as tmp:
            dest = Path(tmp) / run_id
            dest.mkdir()
            subprocess.run(["ffmpeg","-y","-hide_banner","-loglevel","error","-f","image2pipe",
                            "-framerate","10","-vcodec","mjpeg","-i",str(trace/"cameras.mjpg"),
                            "-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",
                            str(dest/"replay.mp4")], check=True)
            steps = []
            for command in commands:
                seq = command["seq"]
                obs = trace / f"observation-{seq:03}.jpg"
                image_path = None
                if obs.exists():
                    with Image.open(obs) as im:
                        im.convert("RGB").save(dest/f"view-{seq:03}.jpg",quality=88)
                        if seq == 0:
                            for i, view in enumerate(VIEWS):
                                im.crop((0,360*i,640,360*(i+1))).save(dest/f"{view}.jpg",quality=86)
                    image_path = f"view-{seq:03}.jpg"
                steps.append({"seq":seq, "observation":image_path, "command":command})
            write_json(dest/"result.json", dict(**meta, target_lift_cm=2, result=result,
                       cameras=list(VIEWS), camera_calibration="provisional", decisions=steps))
            dest.rename(outfile)
    return meta


def sync(trace_root, push):
    RUNS.mkdir(parents=True, exist_ok=True)
    index = RUNS/"index.json"
    previous = json.loads(index.read_text()) if index.exists() else []
    runs = {r["id"]:r for r in previous}
    for score in sorted(trace_root.glob("*/score.json")):
        if score.parent.name.isdigit() and score.parent.name not in runs:
            meta = archive(score.parent)
            if meta:
                runs[meta["id"]] = meta
    if len(runs) != len(previous) or not index.exists():
        write_json(index, sorted(runs.values(),key=lambda r:r["id"],reverse=True))
    if push:
        def git(*args, **kwargs):
            return subprocess.run(["git","-C",str(ROOT),*args], **kwargs)
        git("add","--","docs/runs",check=True)
        if git("diff","--cached","--quiet","--","docs/runs").returncode:
            git("commit","-m","Archive completed SO-ARM101 experiment","--","docs/runs",check=True)
        # Also retries an already-committed upload after a network interruption.
        if git("rev-list","--count","origin/main..HEAD",capture_output=True,text=True,check=True).stdout.strip() != "0":
            git("push","origin","HEAD:main",check=True)


if __name__ == "__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("trace_root",type=Path)
    p.add_argument("--watch",action="store_true")
    p.add_argument("--push",action="store_true")
    args=p.parse_args()
    while True:
        try:
            sync(args.trace_root,args.push)
        except (OSError, ValueError, subprocess.CalledProcessError) as error:
            if not args.watch: raise
            print(error,flush=True)
        if not args.watch: break
        time.sleep(15)
