from ship import postcodes, rates


def code(shipment, service):
    return f"L-{shipment.id.split('-')[1]}-{service[:3].upper()}"


def buy(shipment, service):
    if shipment.labelled:
        raise ValueError(f"{shipment.id} already has label {shipment.label}")
    cost = rates.price(service, shipment.weight, postcodes.zone(shipment.postcode))
    shipment.service = service
    shipment.label = code(shipment, service)
    shipment.status = "labelled"
    shipment.events.append(f"label {shipment.label} bought")
    return cost


def reprint(shipment, service=None):
    if not shipment.labelled:
        raise ValueError(f"{shipment.id} has no label to reprint")
    service = service or shipment.service
    cost = rates.price(service, shipment.weight, postcodes.zone(shipment.postcode))
    shipment.service = service
    shipment.label = code(shipment, service)
    shipment.events.append(f"label {shipment.label} reprinted to {shipment.address}, {shipment.postcode}")
    return cost


def text(shipment):
    return "\n".join([
        f"LABEL {shipment.label}",
        f"TO   {shipment.recipient}",
        f"     {shipment.address}",
        f"     {shipment.postcode} ({postcodes.zone(shipment.postcode)})",
        f"SVC  {shipment.service}  {shipment.weight:.1f} kg",
    ])
