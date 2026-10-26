package api

import (
	"strconv"
	"strings"
)

var jalaliMonths = []string{"فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"}

// gregorianToJalali converts a date of the Gregorian calendar to the Persian (Jalali) one.
func gregorianToJalali(gy, gm, gd int) (int, int, int) {
	gdm := []int{0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334}
	gy2 := gy
	if gm > 2 {
		gy2 = gy + 1
	}
	days := 355666 + 365*gy + (gy2+3)/4 - (gy2+99)/100 + (gy2+399)/400 + gd + gdm[gm-1]
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
		jm, jd = 1+days/31, 1+days%31
	} else {
		jm, jd = 7+(days-186)/30, 1+(days-186)%30
	}
	return jy, jm, jd
}

// jalaliText turns «2026-10-26…» (any text that starts with an ISO date) into «4 آبان 1405»; other text comes back as it is.
func jalaliText(iso string) string {
	iso = strings.TrimSpace(iso)
	if len(iso) < 10 || iso[4] != '-' || iso[7] != '-' {
		return iso
	}
	y, e1 := strconv.Atoi(iso[0:4])
	m, e2 := strconv.Atoi(iso[5:7])
	d, e3 := strconv.Atoi(iso[8:10])
	if e1 != nil || e2 != nil || e3 != nil || m < 1 || m > 12 || d < 1 || d > 31 {
		return iso
	}
	jy, jm, jd := gregorianToJalali(y, m, d)
	return strconv.Itoa(jd) + " " + jalaliMonths[jm-1] + " " + strconv.Itoa(jy)
}
