import json
import numpy as np
from PIL import Image
from scipy import ndimage
imgp = r'D:/web3-multiplayer-games/assets/source/winxp/Frame/UI Theme.png'
im = Image.open(imgp).convert('RGBA')
px = np.array(im)
S = {}


def add(name, x, y, w, h, slice=None, states=None, notes=''):
    S[name] = dict(x=x, y=y, w=w, h=h, slice=slice, states=states, notes=notes)


ST4 = ['normal', 'hover', 'pressed', 'disabled']

# ---- window frame / title
add('window.frame.active', 12, 42, 66, 66, [5, 5, 5, 5], None,
    'Full 4-sided frame, 5px border, fill #efeee0. Left border outer->inner: 0019cf 0831d9 1254e7 166aee 0855dd; top outer->inner 00138c..0048f1; bottom/right mirror. No inactive version (see window.border.*.inactive).')
add('window.frame.opentop', 12, 122, 66, 66, [5, 0, 5, 5], None,
    'Same frame without top border (sits under a title bar).')
tn = {'active': 0, 'inactive': 29}
for nm, x, note in (('', 83, 'top corners rounded (r~5), bottom square: the standard XP title bar'),
                    ('rounded', 14, 'all four corners rounded: floating / tool caption'),
                    ('flat', 152, 'no rounded corners: maximised caption')):
    for s, dy in tn.items():
        key = 'window.title.' + (nm + '.' if nm else '') + s
        add(key, x, 393 + dy, 66, 29, [8, 10, 8, 10], None,
            note + '. Horizontal 3-slice; diagonal sheen means middle is not perfectly flat, scale X only. Height fixed 29.')
add('window.border.left.active', 221, 393, 5, 31, None, {'inactive': dict(x=221, y=424)},
    '5px-wide side border strip (tile vertically). Inactive is 5x28 at (221,424). Mirror (scaleX(-1)) for right side.')
add('window.border.bottom.active', 229, 393, 49, 5, [5, 0, 0, 0], {'inactive': dict(x=229, y=398)},
    'Bottom border strip, 49x5; first 5px = bottom-left corner (mirror for right). Top row is the light inner edge. Inactive at (229,398).')
# ---- titlebar buttons
glyph = ['min', 'max', 'restore', 'close', 'help']
rows = ['normal', 'hover', 'pressed', 'disabled', 'inactive', 'inactive.hover', 'inactive.pressed', 'inactive.disabled']
for c, g in enumerate(glyph):
    x = 375 + 24 * c
    add('titlebtn.%s.normal' % g, x, 236, 21, 21, [4, 4, 4, 4],
        {r: dict(x=x, y=236 + 21 * i) for i, r in enumerate(rows)},
        '21x21 pitch 21. Rows 0-7 as listed; rows 8-11 (y=404..487) repeat the inactive states (help column row 8 is a bright "?"). Whole column x=%d, y=236..487.' % x)
    for i, r in enumerate(rows):
        if i:
            S['titlebtn.%s.%s' % (g, r)] = dict(x=x, y=236 + 21 * i, w=21, h=21, slice=[4, 4, 4, 4], states=None, notes='')
add('titlebtn.blank.blue', 398, 37, 21, 21, [4, 4, 4, 4], {r: dict(x=398, y=37 + 21 * i) for i, r in enumerate(rows)},
    'Empty blue button base (no glyph). 8 rows, same state order as titlebtn.*')
add('titlebtn.blank.red', 422, 37, 21, 21, [4, 4, 4, 4], {r: dict(x=422, y=37 + 21 * i) for i, r in enumerate(rows)},
    'Empty red close-button base (no glyph). 8 rows.')
add('closebtn.mini.normal', 94, 42, 17, 18, None,
    {'normal': dict(x=94, y=42), 'hover': dict(x=94, y=60), 'pressed': dict(x=94, y=78)},
    'Small cream/orange X close button (tooltip/balloon style), 3 states pitch 18.')
# ---- push buttons
bs = ['normal', 'hover', 'pressed', 'disabled', 'default']
add('button.normal', 375, 37, 20, 23, [4, 4, 4, 4], {n: dict(x=375, y=37 + 23 * i) for i, n in enumerate(bs)},
    'Push button, pitch 23. Visible body 18x21 at (+1,+1) with 1px #003c74 outline and r=3 corners; outer 1px is soft shadow; bottom row white glow. Disabled has no outline (cream f5f4ea / c9c7ba). Default = blue inner glow ring.')
for i, n in enumerate(bs[1:], 1):
    add('button.' + n, 375, 37 + 23 * i, 20, 23, [4, 4, 4, 4])
# ---- checkboxes
chk_vals = ['unchecked', 'checked', 'mixed']


def chk(prefix, x, y0, pitch, size, notes):
    for vi, v in enumerate(chk_vals):
        stt = {n: dict(x=x, y=y0 + pitch * (4 * vi + si)) for si, n in enumerate(ST4)}
        add('%s.%s.normal' % (prefix, v), x, y0 + pitch * 4 * vi, size, size, None, stt, notes)
        for si, n in enumerate(ST4):
            if si:
                add('%s.%s.%s' % (prefix, v, n), x, y0 + pitch * (4 * vi + si), size, size)


chk('checkbox', 144, 42, 13, 13,
    'DEFAULT 13px XP-accurate set (border #1c5180, orange hover ring), cells touch, pitch 13. 12 cells: unchecked/checked/mixed x normal/hover/pressed/disabled. Mixed = filled green square (usable as radio-on proxy). NO round radio sprites exist.')
chk('checkbox16', 160, 42, 16, 16, '16px version, pitch 16, same 12-cell order.')
chk('checkbox25', 179, 42, 25, 25, '25px version, pitch 25, same 12-cell order.')
chk('checkbox13s', 125, 42, 16, 16,
    '13px version with 3px soft shadow: sprite 13x13 at top-left of a 16x16 pitch cell (x=125); darker border #003b74; same 12-cell order.')
# ---- scrollbar
add('scrollbar.button.v', 14, 521, 17, 17, [4, 4, 4, 4], {n: dict(x=14, y=521 + 17 * i) for i, n in enumerate(ST4)},
    'Vertical scrollbar end-button background, no glyph. Group y=521..588; identical copy y=589..656 (use for down).')
add('scrollbar.button.h', 14, 657, 17, 17, [4, 4, 4, 4], {n: dict(x=14, y=657 + 17 * i) for i, n in enumerate(ST4)},
    'Horizontal end-button background; two identical groups y=657..724 and y=725..792. Whole column x=14..30, y=521..792 = 16 cells of 17x17.')
add('scrollbar.arrow.left', 119, 521, 16, 16, None, {n: dict(x=119 + 16 * i, y=521) for i, n in enumerate(ST4)},
    '16x16 cells with own bg: normal bg #ebebe4 black arrow; hover bg #c7dcf6 border #6f89b0; pressed bg #9db9d9 white arrow; disabled arrow #cacab7.')
add('scrollbar.arrow.right', 183, 521, 16, 16, None, {n: dict(x=183 + 16 * i, y=521) for i, n in enumerate(ST4)},
    'Mirror of arrow.left. Up/down arrows are NOT in the sheet: rotate these 90deg.')
add('scrollbar.thumb.v', 34, 521, 15, 22, [4, 4, 4, 4], {n: dict(x=34, y=521 + 22 * i) for i, n in enumerate(ST4)},
    'Vertical thumb, pitch 22 (normal c6d6fd, hover d8e8ff, pressed a8c0fb, disabled efefe9). White outline + 1px 7c9fd3 border + shadow. No grip texture.')
add('scrollbar.thumb.h', 250, 521, 22, 15, [4, 4, 4, 4], {n: dict(x=250, y=521 + 15 * i) for i, n in enumerate(ST4)},
    'Horizontal thumb, pitch 15.')
add('scrollbar.track.h', 52, 521, 16, 16, None, {n: dict(x=52 + 16 * i, y=521) for i, n in enumerate(ST4)},
    'UNCERTAIN: 4 flat 16x16 cells white (c1c1bb border) / light-blue aac9eb / mid-blue 9db9d9 / beige f4f4f0; probably track normal/hover/pressed/disabled. Real track bg #ebebe4.')
# ---- taskbar
add('taskbar.bar', 375, 519, 50, 28, [0, 3, 0, 2], None,
    'Horizontal taskbar tile (tile in X). Top 3 rows highlight 3168d5/3888e9/4993e6, body 2259d7->2663e0, bottom 1e50c4/1941a5.')
add('taskbar.bar.vertical', 428, 519, 28, 41, [3, 0, 2, 0], None,
    'Vertical-dock taskbar tile (rotated bar): left 5px highlight, body 235bdd, right 2px dark.')
tk = ['normal', 'hover', 'active', 'normal2', 'active2', 'normal3']
add('taskbar.task.normal', 460, 519, 26, 23, [4, 4, 4, 4], {n: dict(x=460, y=519 + 23 * i) for i, n in enumerate(tk)},
    'Task button set A, 6 cells touching, pitch 23. normal 4085f5, hover brighter 5a99f4, active/pressed dark 164dbc. Cells 3-5 are flatter alternates (205ede/164dbc/205ede).')
for i, n in enumerate(tk):
    if i:
        add('taskbar.task.' + n, 460, 519 + 23 * i, 26, 23, [4, 4, 4, 4])
add('taskbar.taskB.normal', 490, 522, 26, 23, [4, 4, 4, 4], {n: dict(x=490, y=522 + 28 * i) for i, n in enumerate(tk)},
    'Task button set B: same 6 states, pitch 28 with transparent gaps, rounder corners + darker left edge. Alternative skin.')
add('taskbar.slot', 519, 519, 17, 17, [4, 4, 4, 4], {'cell%d' % i: dict(x=519, y=519 + 17 * i) for i in range(16)},
    '16 stacked 17x17 inset square buttons (likely 4 variants x [normal,hover,pressed,flat]); intended use unknown (tray / quick-launch / toolbar). Colours 1944cd..3869f7.')
add('taskbar.chevron.double', 95, 131, 8, 5, None, {'copy%d' % i: dict(x=95, y=131 + 9 * i) for i in range(6)},
    'Black >> glyph, 6 pixel-identical copies. Quick-launch "more" chevron.')
add('taskbar.chevron.down', 107, 128, 9, 6, None, {n: dict(x=107, y=128 + 7 * i) for i, n in enumerate(ST4)},
    'Down chevron #4d6185 (normal=hover=pressed identical), disabled #c9c9c2.')
# ---- start
add('start.normal', 497, 37, 97, 31, [6, 6, 14, 6],
    {'normal': dict(x=497, y=37), 'hover': dict(x=497, y=70), 'pressed': dict(x=497, y=103)},
    'Green Start pill, no label/logo (draw "start" text + logo). Pitch 33. Left edge nearly straight, right end rounded with 2px lip.')
add('start.hover', 497, 70, 97, 31, [6, 6, 14, 6])
add('start.pressed', 497, 103, 97, 31, [6, 6, 14, 6])
add('start.logo', 599, 37, 20, 18, None, None, 'Tiny Windows flag icon (core 602,39 17x16).')
add('go.arrow.normal', 626, 37, 16, 24, None, {'normal': dict(x=626, y=37), 'hover': dict(x=645, y=37)},
    'Green play-triangle (Go button). Second is the bright hover.')
add('go.arrow.hover', 645, 37, 16, 24)

meta = dict(sheet='Frame/UI Theme.png', size=[1024, 1024], sprites=S)
meta['sections'] = {'frames': [14, 17, 70, 15], 'buttons': [376, 17, 75, 15], 'window': [15, 371, 76, 15], 'taskbar': [376, 499, 76, 15]}
meta['ignore'] = {'attribution_plate_packed_by_NullTale': [622, 90, 229, 23], 'stray_pixels': [[59, 460], [59, 470], [59, 480], [114, 814], [115, 814], [116, 814], [117, 814], [118, 814]]}
lb = []
for x, w in ((240, 20), (263, 24), (290, 11)):
    for y in (42, 65, 111, 134):
        lb.append(dict(x=x, y=y, w=w, h=23, notes=''))
lb[0]['notes'] = 'LEFT cap 20px: light-blue rounded box (border a8bfea), gradient white->e9eef6; slice approx [3,7,3,5]. y=42 gradient, y=65 blue (pressed/selected), y=111 white, y=134 gradient'
lb[4]['notes'] = 'MIDDLE 24px: left edge only, right edge flat white join'
lb[8]['notes'] = 'RIGHT cap 11px: left join, right rounded edge'
meta['unlabelled'] = [dict(x=217, y=42, w=20, h=25, notes='pale-blue vertical gradient tile f3f7fd->e0e9fb with c5d2f0 bottom edge: panel/toolbar fill')] + lb
meta['unlabelled_summary'] = ('Light-blue 20/24/11px wide, 23px tall pieces = left/middle/right segments of a tab, toolbar button or '
                              'column-header style control (4 rows each: gradient, pressed-blue, white, gradient). Not mapped to a role.')
json.dump(meta, open('atlas.json', 'w'), indent=1)
print(len(S), 'sprites')
cov = np.zeros((1024, 1024), bool)


def mark(x, y, w, h):
    cov[y:y + h, x:x + w] = True


for n, s in S.items():
    if s['states']:
        for k, p in s['states'].items():
            mark(p['x'], p['y'], s['w'], s['h'])
    mark(s['x'], s['y'], s['w'], s['h'])
for u in meta['unlabelled']:
    mark(u['x'], u['y'], u['w'], u['h'])
for a in list(meta['sections'].values()) + [meta['ignore']['attribution_plate_packed_by_NullTale']]:
    mark(*a)
for p in meta['ignore']['stray_pixels']:
    mark(p[0], p[1], 1, 1)
miss = (px[:, :, 3] > 0) & ~cov
print('uncovered alpha px', miss.sum())
lab, n = ndimage.label(miss, structure=np.ones((3, 3)))
for i, s in enumerate(ndimage.find_objects(lab)):
    print(s[1].start, s[0].start, s[1].stop - s[1].start, s[0].stop - s[0].start, int((lab[s] == i + 1).sum()))
