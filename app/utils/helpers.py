from datetime import datetime, timezone
from math import ceil


def utcnow():
    return datetime.now(timezone.utc)


def format_date_ar(dt):
    """Format datetime for Arabic display."""
    if not dt:
        return ''
    months = {
        1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل',
        5: 'مايو', 6: 'يونيو', 7: 'يوليو', 8: 'أغسطس',
        9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر'
    }
    return f'{dt.day} {months.get(dt.month, "")} {dt.year}'


def format_time_ar(dt):
    """Format time for Arabic display (12-hour)."""
    if not dt:
        return ''
    hour = dt.hour % 12 or 12
    period = 'م' if dt.hour >= 12 else 'ص'
    return f'{hour}:{dt.minute:02d} {period}'


def paginate(query, page, per_page=20):
    """Simple pagination helper."""
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return {
        'items': items,
        'page': page,
        'per_page': per_page,
        'total': total,
        'pages': ceil(total / per_page) if total > 0 else 1,
    }


def safe_int(value, default=1):
    """Safely convert to int."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
