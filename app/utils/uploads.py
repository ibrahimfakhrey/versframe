"""
Local file upload utilities for Shalaby Verse MVP.
Handles secure saving, URL generation, and deletion of uploaded files.
"""

import os
import uuid
from werkzeug.utils import secure_filename


# Allowed extension sets
ALLOWED_IMAGES = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_DOCUMENTS = {'pdf', 'doc', 'docx', 'pptx'}
ALLOWED_CODE = {'py', 'js', 'html', 'css', 'txt'}
ALLOWED_ALL = ALLOWED_IMAGES | ALLOWED_DOCUMENTS | ALLOWED_CODE | {'zip'}

# Size limits (bytes)
MAX_GENERAL_SIZE = 10 * 1024 * 1024   # 10 MB
MAX_SLIDES_SIZE = 50 * 1024 * 1024    # 50 MB

# Base upload directory (relative to app package)
_UPLOAD_BASE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'uploads')


def _get_extension(filename):
    """Extract the file extension in lowercase, without the dot."""
    if '.' not in filename:
        return ''
    return filename.rsplit('.', 1)[1].lower()


def save_upload(file, subfolder, allowed_extensions=None):
    """
    Save an uploaded file to app/static/uploads/<subfolder>/.

    Args:
        file: werkzeug FileStorage object from request.files
        subfolder: one of 'slides', 'homework', 'avatars', 'resources'
        allowed_extensions: set of allowed extensions (without dot).
                           Defaults to ALLOWED_ALL if None.

    Returns:
        The saved filename (with UUID prefix) on success, or None on failure.
    """
    if file is None or file.filename == '':
        return None

    # Determine allowed extensions
    if allowed_extensions is None:
        allowed_extensions = ALLOWED_ALL

    # Validate extension
    ext = _get_extension(file.filename)
    if not ext or ext not in allowed_extensions:
        return None

    # Determine max file size based on subfolder
    max_size = MAX_SLIDES_SIZE if subfolder == 'slides' else MAX_GENERAL_SIZE

    # Read file content to check size
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > max_size:
        return None

    if file_size == 0:
        return None

    # Generate secure filename with UUID prefix
    original = secure_filename(file.filename)
    if not original or original == '':
        original = f'file.{ext}'
    unique_name = f"{uuid.uuid4().hex[:12]}_{original}"

    # Ensure upload directory exists
    upload_dir = os.path.join(_UPLOAD_BASE, subfolder)
    os.makedirs(upload_dir, exist_ok=True)

    # Save file
    filepath = os.path.join(upload_dir, unique_name)
    file.save(filepath)

    return unique_name


def get_upload_url(filename, subfolder):
    """
    Return the URL path for a saved upload.

    Args:
        filename: the saved filename (as returned by save_upload)
        subfolder: one of 'slides', 'homework', 'avatars', 'resources'

    Returns:
        URL string like /static/uploads/<subfolder>/<filename>
    """
    if not filename:
        return ''
    return f'/static/uploads/{subfolder}/{filename}'


def delete_upload(filename, subfolder):
    """
    Delete an uploaded file from disk.

    Args:
        filename: the saved filename
        subfolder: one of 'slides', 'homework', 'avatars', 'resources'

    Returns:
        True if file was deleted, False otherwise.
    """
    if not filename:
        return False
    filepath = os.path.join(_UPLOAD_BASE, subfolder, filename)
    try:
        if os.path.isfile(filepath):
            os.remove(filepath)
            return True
    except OSError:
        pass
    return False
