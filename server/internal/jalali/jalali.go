// Package jalali formats dates in the Persian calendar (for the "last login" text).
package jalali

import (
	"fmt"
	"strings"
	"time"
	_ "time/tzdata" // the server image has no timezone database of its own
)

var tehran *time.Location

func init() {
	loc, err := time.LoadLocation("Asia/Tehran")
	if err != nil {
		loc = time.FixedZone("IRST", 3*3600+1800)
	}
	tehran = loc
}

// FromGregorian converts a Gregorian date to Jalali (year, month, day).
func FromGregorian(gy, gm, gd int) (int, int, int) {
	gdm := []int{0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334}
	gy2 := gy
	if gm > 2 {
		gy2 = gy + 1
	}
	days := 355666 + (365 * gy) + ((gy2 + 3) / 4) - ((gy2 + 99) / 100) + ((gy2 + 399) / 400) + gd + gdm[gm-1]
	jy := -1595 + 33*(days/12053)
	days %= 12053
	jy += 4 * (days / 1461)
	days %= 1461
	if days > 365 {
		jy += (days - 1) / 365
		days = (days - 1) % 365
	}
	var jm, jd int
	if days < 186 {
		jm = 1 + days/31
		jd = 1 + days%31
	} else {
		jm = 7 + (days-186)/30
		jd = 1 + (days-186)%30
	}
	return jy, jm, jd
}

func persianDigits(s string) string {
	return strings.NewReplacer("0", "۰", "1", "۱", "2", "۲", "3", "۳", "4", "۴", "5", "۵", "6", "۶", "7", "۷", "8", "۸", "9", "۹").Replace(s)
}

// Timestamp formats t (Tehran time) like «۱۴۰۵/۷/۹، ۱۲:۳۰:۴۵».
func Timestamp(t time.Time) string {
	t = t.In(tehran)
	jy, jm, jd := FromGregorian(t.Year(), int(t.Month()), t.Day())
	return persianDigits(fmt.Sprintf("%d/%d/%d، %02d:%02d:%02d", jy, jm, jd, t.Hour(), t.Minute(), t.Second()))
}
