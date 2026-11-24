#!/bin/sh
set -eu
install -d -o mediahub /opt/mediahub
cp -r cleanup.py stats.py settings_dump.py mediahub config /opt/mediahub/
install -m 0644 deploy/mediahub-cleanup.service deploy/mediahub-cleanup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mediahub-cleanup.timer
