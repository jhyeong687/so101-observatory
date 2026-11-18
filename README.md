# SO-ARM101 실험 관측소

[관측소 열기](https://jhyeong687.github.io/so101-observatory/)

맥에서 실행하는 MuJoCo 시뮬레이터의 wrist, belly, top 영상을 보고 실험별 MP4, 측정값, 카메라 관찰과 행동을 확인할 수 있습니다. GitHub Pages는 `main` 브랜치의 `docs/`를 제공합니다. 라이브 연결이 끊기면 선택한 실험의 마지막 저장 화면을 표시합니다.

## 방송과 기록

맥에서 SO-ARM101 시뮬레이터가 `127.0.0.1:8876`에 실행된 상태에서 Python 3.10 이상과 Pillow로 `python tools/live_feed.py`를 실행합니다. 이 프로세스가 `127.0.0.1:8877/snapshot`에서 가상 카메라와 현재 행동만 제공합니다. 라이브 원본은 맥이 켜져 있고 시뮬레이터와 중계가 실행되는 동안 갱신됩니다.

`cloudflared tunnel --url http://127.0.0.1:8877`을 실행하고 출력된 HTTPS 주소에 `/snapshot`을 붙여 `docs/live.json`의 `endpoint`를 갱신한 뒤 Pages로 배포합니다. Quick Tunnel을 새로 시작하면 주소가 달라집니다.

완료된 카메라 실험은 아래 명령으로 보관합니다. 현재 세션에서 실행한 수집기는 15초마다 완료 파일을 확인합니다. ffmpeg와 git push 권한이 필요합니다.

```sh
python tools/archive.py /path/to/vision_trace --watch --push
```

`docs/runs/<id>/result.json`에는 시작 시각과 모델, 상승 높이, 낙하 횟수, 재파지 후 운반 거리, 최종 이동 거리, 바닥 접촉 판정, 관찰별 판단이 저장됩니다. `view-*.jpg`는 각 행동을 선택한 시점의 사진입니다. `replay.mp4`는 동작 위주로 기록하며 판단 대기 시간은 압축합니다. 카메라 장착 치수는 실물 보정 전의 임시값입니다.

SO-101 모델 출처는 [MuJoCo Menagerie](https://github.com/google-deepmind/mujoco_menagerie/tree/main/robotstudio_so101)입니다. 헤더는 같은 시뮬레이터 모델을 별도 시점에서 렌더링했습니다. Barlow Condensed 글꼴은 SIL Open Font License로 배포됩니다.
