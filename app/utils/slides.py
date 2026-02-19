"""
Slide conversion utilities for Shalaby Verse.
Converts PDF/PPTX files to PNG slide images for the live room viewer.
"""

import os
import shutil
import subprocess

# Base directory for slide image output
_UPLOAD_BASE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'uploads')


def convert_to_slide_images(file_path, resource_id):
    """
    Convert a PDF or PPTX file to individual PNG slide images.

    Args:
        file_path: absolute path to the uploaded PDF or PPTX file
        resource_id: unique identifier used as output subfolder name

    Returns:
        list of URL paths for the generated slide images, e.g.
        ['/static/uploads/slides/<resource_id>/slide_001.png', ...]

    Raises:
        ValueError: if the file format is unsupported
        RuntimeError: if conversion fails
    """
    ext = os.path.splitext(file_path)[1].lower()
    output_dir = os.path.join(_UPLOAD_BASE, 'slides', str(resource_id))
    os.makedirs(output_dir, exist_ok=True)

    pdf_path = file_path

    # PPTX: convert to PDF first using LibreOffice
    if ext in ('.pptx', '.ppt'):
        pdf_path = _pptx_to_pdf(file_path, output_dir)

    if ext not in ('.pdf', '.pptx', '.ppt'):
        raise ValueError(f'Unsupported file format: {ext}')

    # Convert PDF pages to PNG images
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(pdf_path, dpi=200, fmt='png')
    except Exception as e:
        raise RuntimeError(f'PDF conversion failed: {e}')

    slide_urls = []
    for i, img in enumerate(images):
        filename = f'slide_{i + 1:03d}.png'
        img_path = os.path.join(output_dir, filename)
        img.save(img_path, 'PNG')
        slide_urls.append(f'/static/uploads/slides/{resource_id}/{filename}')

    # Clean up intermediate PDF if we generated one from PPTX
    if ext in ('.pptx', '.ppt') and pdf_path != file_path and os.path.exists(pdf_path):
        os.remove(pdf_path)

    return slide_urls


def _pptx_to_pdf(pptx_path, output_dir):
    """
    Convert PPTX to PDF using LibreOffice headless mode.

    Returns:
        path to the generated PDF file
    """
    try:
        subprocess.run([
            'libreoffice', '--headless', '--convert-to', 'pdf',
            '--outdir', output_dir, pptx_path
        ], check=True, timeout=120, capture_output=True)
    except FileNotFoundError:
        raise RuntimeError(
            'LibreOffice is not installed. PPTX conversion requires LibreOffice. '
            'Please upload a PDF file instead.'
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError('PPTX to PDF conversion timed out')
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f'LibreOffice conversion failed: {e.stderr.decode("utf-8", errors="replace")}')

    # LibreOffice outputs PDF with same basename in output_dir
    basename = os.path.splitext(os.path.basename(pptx_path))[0]
    pdf_path = os.path.join(output_dir, basename + '.pdf')
    if not os.path.exists(pdf_path):
        raise RuntimeError('LibreOffice did not produce a PDF output')
    return pdf_path


def cleanup_slide_images(resource_id):
    """
    Remove all generated slide images for a resource (e.g. before re-upload).

    Args:
        resource_id: the resource identifier whose slides folder to remove
    """
    output_dir = os.path.join(_UPLOAD_BASE, 'slides', str(resource_id))
    if os.path.isdir(output_dir):
        shutil.rmtree(output_dir, ignore_errors=True)
