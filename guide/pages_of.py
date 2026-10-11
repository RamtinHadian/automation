import json, re, subprocess, sys

# the page of every chapter: each chapter heading carries an invisible marker «@@k<letters>@@» (digits written as letters a..j, because the
# PDF does not keep the Persian digits as text); the page is the number printed at the bottom of the page
pdf, out = sys.argv[1], sys.argv[2]
text = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True).stdout.decode('utf-8', 'ignore')
pages = {}
for i, pg in enumerate(text.split('\f')):
    for m in re.finditer(r'@@k([a-j]+)@@', pg):
        pages.setdefault('c' + ''.join(str(ord(ch) - 97) for ch in m.group(1)), i + 1)
json.dump(pages, open(out, 'w'))
print(pages)
