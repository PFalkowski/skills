import loader
import registry
import sources

for filename, text in sources.FILES.items():
    name = registry.register(filename, loader.parse(text))
    print(name, sum(n for _, n in registry.DATASETS[name]))
