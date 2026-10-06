FROM postgres:16-alpine
# smbclient copies the backups to a Windows / NAS network folder.
# Servers with no access to the Alpine package servers must not hang or fail here: after two minutes the build goes on
# without it (the nightly database backup does not need it; only copying to a network folder does).
RUN (timeout 120 apk add --no-cache samba-client) || echo "samba-client could not be installed: copying backups to a network folder is unavailable"
# rclone copies the backups to Google Drive / OneDrive (same rule: never block the build when the package server is out of reach).
RUN (timeout 120 apk add --no-cache rclone) || echo "rclone could not be installed: copying backups to Google Drive / OneDrive is unavailable"
# the script lives inside the image, so a changed script rebuilds the image and the container restarts with it
COPY backup-loop.sh /backup-loop.sh
