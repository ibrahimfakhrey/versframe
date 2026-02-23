from app.extensions import db
from app.models.journey import StudentWallet, CurrencyTransaction


def get_or_create_wallet(student_id):
    wallet = StudentWallet.query.filter_by(student_id=student_id).first()
    if not wallet:
        wallet = StudentWallet(student_id=student_id, coins=0, gems=0)
        db.session.add(wallet)
        db.session.flush()
    return wallet


def award_coins(student_id, amount, reason=''):
    wallet = get_or_create_wallet(student_id)
    wallet.coins += amount
    db.session.add(CurrencyTransaction(
        student_id=student_id, currency='coins', amount=amount, reason=reason
    ))
    db.session.commit()
    return wallet.coins


def award_gems(student_id, amount, reason=''):
    wallet = get_or_create_wallet(student_id)
    wallet.gems += amount
    db.session.add(CurrencyTransaction(
        student_id=student_id, currency='gems', amount=amount, reason=reason
    ))
    db.session.commit()
    return wallet.gems


def spend_coins(student_id, amount, reason=''):
    wallet = get_or_create_wallet(student_id)
    if wallet.coins < amount:
        return False
    wallet.coins -= amount
    db.session.add(CurrencyTransaction(
        student_id=student_id, currency='coins', amount=-amount, reason=reason
    ))
    db.session.commit()
    return True


def spend_gems(student_id, amount, reason=''):
    wallet = get_or_create_wallet(student_id)
    if wallet.gems < amount:
        return False
    wallet.gems -= amount
    db.session.add(CurrencyTransaction(
        student_id=student_id, currency='gems', amount=-amount, reason=reason
    ))
    db.session.commit()
    return True
