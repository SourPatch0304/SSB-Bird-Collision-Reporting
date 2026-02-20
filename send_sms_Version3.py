from flask import Flask, request
from twilio.twiml.messaging_response import MessagingResponse
import os
import io
import logging
import requests
from datetime import datetime
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import geohash2

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = Flask(__name__)

MAX_IMAGES = 5

# ---------------------------------------------------------------------------
# EXIF parsing
# ---------------------------------------------------------------------------

def get_exif_data(image: Image.Image) -> dict:
    """Return a flat dict of decoded EXIF tags from a PIL Image."""
    exif_data = {}
    try:
        raw = image._getexif()
        if raw:
            for tag_id, value in raw.items():
                tag = TAGS.get(tag_id, tag_id)
                exif_data[tag] = value
    except Exception as e:
        logger.warning(f"Could not read EXIF: {e}")
    return exif_data


def parse_capture_time(exif_data: dict) -> datetime | None:
    """Return capture datetime from EXIF, trying three tags in order of preference."""
    for tag in ("DateTimeOriginal", "DateTimeDigitized", "DateTime"):
        raw = exif_data.get(tag)
        if raw:
            try:
                return datetime.strptime(raw, "%Y:%m:%d %H:%M:%S")
            except ValueError:
                logger.warning(f"Could not parse EXIF timestamp '{raw}' from tag '{tag}'")
    return None


def parse_gps(exif_data: dict) -> dict:
    """
    Extract GPS info from decoded EXIF data.

    Returns a dict with any of:
        latitude, longitude, altitude, exif_accuracy_m, geohash
    Returns an empty dict when GPS data is absent or unparseable.
    """
    gps_info_raw = exif_data.get("GPSInfo")
    if not gps_info_raw:
        return {}

    gps = {GPSTAGS.get(tag_id, tag_id): value for tag_id, value in gps_info_raw.items()}

    def _rational(v) -> float:
        if hasattr(v, "numerator"):     # IFDRational
            return float(v)
        if isinstance(v, tuple):        # (numerator, denominator)
            return v[0] / v[1] if v[1] else 0.0
        return float(v)

    def _to_degrees(values) -> float:
        d, m, s = values
        return _rational(d) + _rational(m) / 60.0 + _rational(s) / 3600.0

    result = {}
    try:
        lat_vals = gps.get("GPSLatitude")
        lat_ref  = gps.get("GPSLatitudeRef", "N")
        lon_vals = gps.get("GPSLongitude")
        lon_ref  = gps.get("GPSLongitudeRef", "E")

        if lat_vals and lon_vals:
            lat = _to_degrees(lat_vals)
            lon = _to_degrees(lon_vals)
            if lat_ref == "S": lat = -lat
            if lon_ref == "W": lon = -lon
            result["latitude"]  = lat
            result["longitude"] = lon
            result["geohash"]   = geohash2.encode(lat, lon, precision=9)

        alt_val = gps.get("GPSAltitude")
        if alt_val is not None:
            result["altitude"] = (
                float(alt_val) if not isinstance(alt_val, tuple)
                else alt_val[0] / alt_val[1]
            )

        accuracy = gps.get("GPSHPositioningError") or gps.get("GPSMeasureMode")
        if accuracy is not None:
            try:
                result["exif_accuracy_m"] = float(accuracy)
            except (TypeError, ValueError):
                pass

    except Exception as e:
        logger.warning(f"Error parsing GPS fields: {e}")

    return result


def parse_orientation(exif_data: dict) -> int | None:
    val = exif_data.get("Orientation")
    return int(val) if val is not None else None


def parse_device(exif_data: dict) -> dict:
    device = {}
    make  = exif_data.get("Make")
    model = exif_data.get("Model")
    if make:  device["make"]  = make.strip()
    if model: device["model"] = model.strip()
    return device

# ---------------------------------------------------------------------------
# Image metadata model
# ---------------------------------------------------------------------------

class ImageMetadata:
    def __init__(
        self,
        *,
        exif_capture_time: datetime | None,
        message_received_at: datetime,
        latitude: float | None,
        longitude: float | None,
        altitude: float | None,
        geohash: str | None,
        exif_accuracy_m: float | None,
        orientation: int | None,
        make: str | None,
        model: str | None,
        missing_fields: list[str],
    ):
        # Prefer EXIF capture time; fall back to message receipt time
        if exif_capture_time is not None:
            self.observed_at        = exif_capture_time
            self.observed_at_source = "exif"
        else:
            self.observed_at        = message_received_at
            self.observed_at_source = "message_received"

        self.exif_capture_time   = exif_capture_time
        self.message_received_at = message_received_at
        self.latitude            = latitude
        self.longitude           = longitude
        self.altitude            = altitude
        self.geohash             = geohash
        self.exif_accuracy_m     = exif_accuracy_m
        self.orientation         = orientation
        self.make                = make
        self.model               = model
        self.missing_fields      = missing_fields

    def to_dict(self) -> dict:
        return {
            "observed_at":         self.observed_at.isoformat() if self.observed_at else None,
            "observed_at_source":  self.observed_at_source,
            "exif_capture_time":   self.exif_capture_time.isoformat() if self.exif_capture_time else None,
            "message_received_at": self.message_received_at.isoformat(),
            "latitude":            self.latitude,
            "longitude":           self.longitude,
            "altitude":            self.altitude,
            "geohash":             self.geohash,
            "exif_accuracy_m":     self.exif_accuracy_m,
            "orientation":         self.orientation,
            "make":                self.make,
            "model":               self.model,
            "missing_fields":      self.missing_fields,
        }

# ---------------------------------------------------------------------------
# Report model
# ---------------------------------------------------------------------------

class Report:
    def __init__(
        self,
        message_sid: str,
        from_phone: str,
        message_body: str,
        images: list[ImageMetadata],
    ):
        self.message_sid  = message_sid
        self.from_phone   = from_phone
        self.message_body = message_body
        self.images       = images
        self.num_images   = len(images)

    def get_summary(self) -> dict:
        return {
            "message_sid":           self.message_sid,
            "num_images":            self.num_images,
            "images_with_location":  sum(1 for img in self.images if img.latitude is not None),
            "images_with_exif_time": sum(1 for img in self.images if img.exif_capture_time is not None),
            "images_with_geohash":   sum(1 for img in self.images if img.geohash is not None),
            "images_with_accuracy":  sum(1 for img in self.images if img.exif_accuracy_m is not None),
        }

# ---------------------------------------------------------------------------
# Media processing
# ---------------------------------------------------------------------------

def extract_image_metadata(image_bytes: bytes, message_received_at: datetime) -> ImageMetadata:
    """Open raw image bytes, extract all EXIF fields, and return an ImageMetadata."""
    missing: list[str] = []

    try:
        image = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        logger.error(f"Cannot open image: {e}")
        return ImageMetadata(
            exif_capture_time=None, message_received_at=message_received_at,
            latitude=None, longitude=None, altitude=None,
            geohash=None, exif_accuracy_m=None,
            orientation=None, make=None, model=None,
            missing_fields=["capture_time", "gps", "orientation", "make", "model"],
        )

    exif_data = get_exif_data(image)

    capture_time = parse_capture_time(exif_data)
    if capture_time is None:
        missing.append("capture_time")

    gps             = parse_gps(exif_data)
    latitude        = gps.get("latitude")
    longitude       = gps.get("longitude")
    altitude        = gps.get("altitude")
    geohash         = gps.get("geohash")
    exif_accuracy_m = gps.get("exif_accuracy_m")

    if latitude is None or longitude is None:
        missing.append("gps")
    if exif_accuracy_m is None:
        missing.append("exif_accuracy_m")

    orientation = parse_orientation(exif_data)
    if orientation is None:
        missing.append("orientation")

    device = parse_device(exif_data)
    make   = device.get("make")
    model  = device.get("model")
    if not make:  missing.append("make")
    if not model: missing.append("model")

    if missing:
        logger.info(f"Missing EXIF fields: {missing}")

    return ImageMetadata(
        exif_capture_time=capture_time,
        message_received_at=message_received_at,
        latitude=latitude, longitude=longitude, altitude=altitude,
        geohash=geohash, exif_accuracy_m=exif_accuracy_m,
        orientation=orientation, make=make, model=model,
        missing_fields=missing,
    )


def process_media_items(
    *,
    media_items: list[dict],
    message_received_at: datetime,
    message_sid: str,
    from_phone: str,
    message_body: str,
) -> Report:
    """Download each media URL, extract EXIF metadata, and return a Report."""
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
    auth_token  = os.environ.get("TWILIO_AUTH_TOKEN", "")
    auth        = (account_sid, auth_token) if account_sid else None

    images: list[ImageMetadata] = []

    for idx, item in enumerate(media_items):
        url = item["url"]
        logger.info(f"Downloading media {idx}: {url} ({item.get('content_type', '')})")

        try:
            resp = requests.get(url, auth=auth, timeout=15)
            resp.raise_for_status()
            image_bytes = resp.content
        except Exception as e:
            logger.error(f"Failed to download media {idx} from {url}: {e}")
            images.append(ImageMetadata(
                exif_capture_time=None, message_received_at=message_received_at,
                latitude=None, longitude=None, altitude=None,
                geohash=None, exif_accuracy_m=None,
                orientation=None, make=None, model=None,
                missing_fields=["download_failed", "capture_time", "gps", "orientation", "make", "model"],
            ))
            continue

        metadata = extract_image_metadata(image_bytes, message_received_at)
        logger.debug(f"Media {idx} metadata: {metadata.to_dict()}")
        images.append(metadata)

    return Report(
        message_sid=message_sid,
        from_phone=from_phone,
        message_body=message_body,
        images=images,
    )

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/incoming-message", methods=["POST"])
def incoming_message():
    """Handle incoming SMS/MMS from Twilio."""
    try:
        logger.info("=== INCOMING REQUEST ===")
        logger.info(f"Headers: {dict(request.headers)}")
        logger.info(f"Form data: {dict(request.form)}")

        num_media           = int(request.form.get("NumMedia", 0))
        from_number         = request.form.get("From", "")
        message_body        = request.form.get("Body", "")
        message_sid         = request.form.get("MessageSid", "")
        message_received_at = datetime.now()

        response = MessagingResponse()
        logger.info(f"Incoming message from {from_number}: {num_media} media items")

        if num_media == 0:
            response.message("Please send at least one photo.")
            logger.warning(f"Rejected message {message_sid}: No media attached")
            return str(response), 200, {"Content-Type": "application/xml"}

        if num_media > MAX_IMAGES:
            response.message(f"Please send between 1 and {MAX_IMAGES} photos. You sent {num_media}.")
            logger.warning(f"Rejected message {message_sid}: Too many media items ({num_media})")
            return str(response), 200, {"Content-Type": "application/xml"}

        media_items = [
            {
                "url":          request.form.get(f"MediaUrl{i}"),
                "content_type": request.form.get(f"MediaContentType{i}"),
            }
            for i in range(num_media)
        ]

        logger.info(f"Accepted message {message_sid}: {num_media} media items")

        try:
            report  = process_media_items(
                media_items=media_items,
                message_received_at=message_received_at,
                message_sid=message_sid,
                from_phone=from_number,
                message_body=message_body,
            )
            summary = report.get_summary()
            logger.info(f"Report processing complete: {summary}")

            response_msg = f"Thanks for your report! We received {report.num_images} photo(s)."
            if summary["images_with_location"] > 0:
                response_msg += f"\n📍 Location detected in {summary['images_with_location']} image(s)."
            if summary["images_with_exif_time"] > 0:
                response_msg += f"\n🕐 Timestamps extracted from {summary['images_with_exif_time']} image(s)."

            response.message(response_msg)

            # TODO: Save report to database (Epic 3)
            logger.info(f"Report ready for storage: {report.message_sid}")

        except Exception as proc_error:
            logger.error(f"Error processing images: {proc_error}", exc_info=True)
            response.message("Thanks for your report! We received your photo(s). (Some metadata may be unavailable)")

        return str(response), 200, {"Content-Type": "application/xml"}

    except Exception as e:
        logger.error(f"ERROR processing message: {str(e)}", exc_info=True)
        response = MessagingResponse()
        response.message("Sorry, there was an error processing your request.")
        return str(response), 200, {"Content-Type": "application/xml"}


@app.route("/health", methods=["GET"])
def health_check():
    logger.info("Health check called")
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}, 200


@app.route("/", methods=["GET"])
def index():
    return {"message": "Photo Report Intake API", "status": "running"}, 200

# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting Flask app on port {port}")
    app.run(host="0.0.0.0", port=port, debug=True)