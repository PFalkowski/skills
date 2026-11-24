from store import save, save_many, rename

disk = {}
save("a.txt", "x", disk)
save_many([("/b.txt", "y")], disk)
rename("a.txt", "c.txt", disk)
print(sorted(disk))
