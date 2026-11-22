//go:build linux

package auth

import (
	"fmt"
	"syscall"
)

func statfs(path string) string {
	var s syscall.Statfs_t
	if syscall.Statfs(path, &s) != nil {
		return ""
	}
	total, free := s.Blocks*uint64(s.Bsize), s.Bavail*uint64(s.Bsize)
	return fmt.Sprintf("disk %s: total %d GB, free %d GB (%d%% used)", path, total>>30, free>>30, 100-int(free*100/(total+1)))
}
