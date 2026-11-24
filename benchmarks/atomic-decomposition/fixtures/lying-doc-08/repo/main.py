from slug import slugify

for title in ["Hello World", "Crème Brûlée", "Tom & Jerry", "  Q&A  "]:
    print(repr(slugify(title)))
