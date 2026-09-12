"""Formats the `[dev] outcome` JSON lines from logcat (see dev-run.sh)."""
import json
import sys

tag = sys.argv[1]
for line in sys.stdin:
    line = line.strip()
    if line.startswith('outcome'):
        d = json.loads(line[len('outcome'):])
        r = d.get('result') or {}
        if d['ok']:
            print(f"{tag}: {d['ms']} ms  muac {r['muacCm']:.2f} cm  z {r['z']:+.2f}  {r['decision']:6}  "
                  f"side {r['armSide']}  used {r['pointsUsed']}/5  armPx {r['armWidthPx']}  heightPx {r['heightPx']}  "
                  f"imputed {r['imputed'] or '-'}")
        else:
            print(f"{tag}: {d['ms']} ms  CANNOT ({d['reason']}: {d['detail']})")
    else:
        print(f"{tag}: {line[:400]}")
