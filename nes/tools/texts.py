"""Every line of text the ROM draws: (screen row, screen column or None to centre, text)."""
TITLE = [
    (10, None, 'WHITEOUT ON THE HIGHWAY'),
    (11, None, 'DEMASTERED'),
    (13, None, 'The next exit is just up'),
    (14, None, 'ahead. Keep the road open'),
    (15, None, 'till you get there.'),
    (17, None, '< >  steer across the road'),
    (18, None, '^ A  sound the horn       '),
    (19, None, 'B    sound the horn too   '),
    (21, None, 'PRESS START TO ROLL OUT'),
]
TITLE_BIG = (6, 'neverending'), (8, 'tunnel iv')
BEST = (23, 7, 'Your best:')       # + the number
OVER = [(7, None, 'off the road')]
PAUSED = [(12, None, 'paused'), (14, None, 'PRESS START TO KEEP DRIVING')]
GO = (21, None, 'PRESS START: BACK ON THE ROAD')
MILESTONES = [(150, 'the road is yours'), (450, 'visibility: zero'), (900, 'keep it between the posts'),
              (1500, 'the storm is getting worse'), (2300, 'the exit should be right here'), (3300, 'stay awake'),
              (4500, 'they keep shovelling'), (6000, 'any mile now'), (8000, 'nearly'),
              (10000, 'the longest whiteout on record')]
HINTS = {'robot': 'honk and they hop aside', 'crew': 'crews hold the line: find gap', 'car': 'go round',
         'drift': 'plow straight through', 'buried': 'buried cars', 'walker': 'honk and they run',
         'jackknife': 'jackknifed semi: find the gap', 'spin': 'spinning out', 'tire': 'loose tire', 'leaper': 'robot!'}
DEATH = {'robot': 'you plowed into a robot', 'crew': 'you plowed into the crew', 'car': 'you rear-ended a car',
         'spin': 'a spinning car got you', 'buried': 'you hit a buried car', 'walker': 'you hit a robot crossing',
         'jackknife': 'you hit the jackknifed semi', 'tire': 'a loose tire got you', 'leaper': 'a robot jumped in front of you'}
