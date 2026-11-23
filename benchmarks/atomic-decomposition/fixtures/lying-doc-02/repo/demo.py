from slug import slugify

for title in ["Hello, World!", "  Spring  Sale 2024 ", "Tom & Jerry's Guide"]:
    print(slugify(title))
