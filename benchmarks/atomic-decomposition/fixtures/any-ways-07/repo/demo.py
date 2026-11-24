import io

from loader import load
from vault import Vault

v = Vault()
print(load(v, io.StringIO("SPRING24\nWINTER24\nAUTUMN25\n")))
print(sorted(v.codes))
