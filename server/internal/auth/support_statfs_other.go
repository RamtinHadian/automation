//go:build !linux

package auth

func statfs(path string) string { return "" }
