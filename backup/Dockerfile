FROM postgres:16-alpine
# smbclient copies the backups to a Windows / NAS network folder
RUN apk add --no-cache samba-client
# the script lives inside the image, so a changed script rebuilds the image and the container restarts with it
COPY backup-loop.sh /backup-loop.sh
