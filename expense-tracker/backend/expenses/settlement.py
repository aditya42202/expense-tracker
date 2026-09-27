from decimal import Decimal, ROUND_HALF_UP


CENT = Decimal("0.01")


def money(value):
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def calculate_settlement(total, participants):
    """Return equal shares, net balances, and creditor/debtor transfers in cents."""
    total = money(total)
    count = len(participants)
    if not count:
        return [], []

    total_cents = int(total * 100)
    base_cents, remainder = divmod(total_cents, count)
    balances = []
    for index, participant in enumerate(participants):
        share_cents = base_cents + (1 if index < remainder else 0)
        paid_cents = int(money(participant["paid_amount"]) * 100)
        balances.append({
            **participant,
            "share_amount": Decimal(share_cents) / 100,
            "net": Decimal(paid_cents - share_cents) / 100,
        })

    creditors = [{"name": item["name"], "remaining": int(item["net"] * 100)} for item in balances if item["net"] > 0]
    debtors = [{"name": item["name"], "remaining": abs(int(item["net"] * 100))} for item in balances if item["net"] < 0]
    transfers = []
    debtor_index = creditor_index = 0
    while debtor_index < len(debtors) and creditor_index < len(creditors):
        cents = min(debtors[debtor_index]["remaining"], creditors[creditor_index]["remaining"])
        transfers.append({"from": debtors[debtor_index]["name"], "to": creditors[creditor_index]["name"], "amount": Decimal(cents) / 100})
        debtors[debtor_index]["remaining"] -= cents
        creditors[creditor_index]["remaining"] -= cents
        if debtors[debtor_index]["remaining"] == 0:
            debtor_index += 1
        if creditors[creditor_index]["remaining"] == 0:
            creditor_index += 1
    return [{**item, "share_amount": money(item["share_amount"]), "net": money(item["net"])} for item in balances], transfers