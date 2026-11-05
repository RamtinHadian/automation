#!/bin/bash
# Run this ONCE on the Issabel (phone system) server, as root:
#     bash issabel-allow-hoormand.sh  <IP of the Hoormand server>  [AMI user name]
# It lets the Hoormand server log in to the phone system (AMI) directly, so no SSH tunnel is needed.
# It changes nothing else: a backup of manager.conf is made first, only a "permit" line is added, and AMI is reloaded.
set -e
IP="$1"
USER_NAME="${2:-}"
if [ -z "$IP" ]; then echo "Usage: bash $0 <Hoormand server IP> [AMI user]"; exit 1; fi
CONF=/etc/asterisk/manager.conf
[ -f "$CONF" ] || { echo "manager.conf not found at $CONF"; exit 1; }
cp -a "$CONF" "$CONF.bak.$(date +%Y%m%d%H%M%S)"
echo "Backup made: $CONF.bak.*"
if [ -z "$USER_NAME" ]; then
  echo "AMI users found in manager.conf:"; grep -E '^\[[^]]+\]' "$CONF" | grep -v '^\[general\]'
  echo "Run again with the user name as the 2nd argument, e.g.:  bash $0 $IP hoormand"; exit 0
fi
if ! grep -q "^\[$USER_NAME\]" "$CONF"; then echo "User [$USER_NAME] not found in $CONF"; exit 1; fi
# add the permit line right under the user's section (once)
if sed -n "/^\[$USER_NAME\]/,/^\[/p" "$CONF" | grep -q "^permit=$IP/"; then
  echo "permit for $IP already there."
else
  sed -i "/^\[$USER_NAME\]/a permit=$IP/255.255.255.255" "$CONF"
  echo "Added: permit=$IP/255.255.255.255  to [$USER_NAME]"
fi
asterisk -rx "manager reload" >/dev/null 2>&1 && echo "AMI reloaded." || echo "Reload manually: asterisk -rx 'manager reload'"
echo "Check that port 5038 is open from the Hoormand server: (on that server)  nc -vz <Issabel address> 5038"
