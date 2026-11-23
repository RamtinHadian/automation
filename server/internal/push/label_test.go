package push

import "testing"

func TestDeviceLabel(t *testing.T) {
	cases := map[string]string{
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1": "آیفون (Safari)",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0":              "ویندوز (Edge)",
		"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36":                                              "اندروید (Chrome)",
		"": "دستگاه ناشناس",
	}
	for ua, want := range cases {
		if got := DeviceLabel(ua); got != want {
			t.Errorf("%q -> %q, want %q", ua, got, want)
		}
	}
}
