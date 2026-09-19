"""Smallest possible Bedrock check: can this account, region and model read an image?

Usage (from backend/, with AWS_REGION and MODEL_ID set):
    python scripts/smoke_bedrock.py ../samples/amma-2026-09-12.jpg

On failure it prints AWS's exact error code, message and request ID, which is
what an AWS mentor needs to look the problem up.
"""
import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

FORMATS = {".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png"}


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/smoke_bedrock.py <image.jpg|image.png>")
        return 2
    image_path = Path(sys.argv[1])
    region = os.environ.get("AWS_REGION")
    model_id = os.environ.get("MODEL_ID")
    if not region or not model_id:
        print("Set AWS_REGION and MODEL_ID first, e.g. us-east-1 and us.amazon.nova-pro-v1:0")
        return 2
    image_format = FORMATS.get(image_path.suffix.lower())
    if image_format is None:
        print("The image must be .jpg, .jpeg or .png")
        return 2

    client = boto3.client("bedrock-runtime", region_name=region)
    print(f"Region {region}, model {model_id}, image {image_path.name} ({image_path.stat().st_size} bytes)")
    try:
        response = client.converse(
            modelId=model_id,
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": image_format, "source": {"bytes": image_path.read_bytes()}}},
                    {"text": "List every test name and numeric value you can read."},
                ],
            }],
            inferenceConfig={"temperature": 0},
        )
    except NoCredentialsError:
        print("No AWS credentials on this machine. Run `aws configure` first.")
        return 1
    except ClientError as e:
        err = e.response.get("Error", {})
        meta = e.response.get("ResponseMetadata", {})
        print("FAILED")
        print(f"  code:       {err.get('Code')}")
        print(f"  message:    {err.get('Message')}")
        print(f"  request id: {meta.get('RequestId')}")
        print(f"  http:       {meta.get('HTTPStatusCode')}")
        return 1
    except BotoCoreError as e:
        print(f"FAILED before reaching AWS: {e}")
        return 1

    print("OK")
    print(response["output"]["message"]["content"][0]["text"])
    print(f"(took {response['metrics']['latencyMs']} ms)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
