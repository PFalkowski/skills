import storage
import validators


def handle(name, data):
    try:
        validators.check_name(name)
        size = storage.save(name, data)
    except ValueError as err:
        return {"status": 400, "error": str(err)}
    return {"status": 201, "size": size}
