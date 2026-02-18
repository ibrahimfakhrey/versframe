import boto3
from flask import current_app
from botocore.exceptions import ClientError


def get_s3_client():
    return boto3.client(
        's3',
        region_name=current_app.config['S3_REGION'],
        aws_access_key_id=current_app.config['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=current_app.config['AWS_SECRET_ACCESS_KEY'],
    )


def upload_file(file_obj, s3_key, content_type=None):
    """Upload a file object to S3."""
    s3 = get_s3_client()
    extra_args = {}
    if content_type:
        extra_args['ContentType'] = content_type
    s3.upload_fileobj(file_obj, current_app.config['S3_BUCKET'], s3_key, ExtraArgs=extra_args)
    return s3_key


def upload_bytes(data, s3_key, content_type='application/octet-stream'):
    """Upload bytes data to S3."""
    import io
    return upload_file(io.BytesIO(data), s3_key, content_type)


def get_presigned_url(s3_key, expires_in=3600):
    """Generate a presigned URL for downloading."""
    s3 = get_s3_client()
    try:
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': current_app.config['S3_BUCKET'], 'Key': s3_key},
            ExpiresIn=expires_in,
        )
        return url
    except ClientError:
        return None


def get_presigned_upload_url(s3_key, content_type='application/octet-stream', expires_in=3600):
    """Generate a presigned URL for client-side upload."""
    s3 = get_s3_client()
    try:
        url = s3.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': current_app.config['S3_BUCKET'],
                'Key': s3_key,
                'ContentType': content_type,
            },
            ExpiresIn=expires_in,
        )
        return url
    except ClientError:
        return None


def delete_file(s3_key):
    """Delete a file from S3."""
    s3 = get_s3_client()
    try:
        s3.delete_object(Bucket=current_app.config['S3_BUCKET'], Key=s3_key)
        return True
    except ClientError:
        return False
