from blog import Blog

blog = Blog()
for title in ["Hello, World!", "Hello World", "Año Nuevo", "Año Nuevo"]:
    print(blog.publish(title))
