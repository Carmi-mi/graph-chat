"""SQLAlchemy ORM models.

Import all models here so they register with Base.metadata
for create_all / drop_all operations.
"""

from app.models.annotation import Annotation  # noqa: F401
from app.models.conversation import Conversation  # noqa: F401
from app.models.merge_record import MergeRecord  # noqa: F401
from app.models.message import Message  # noqa: F401
from app.models.message_context_summary import MessageContextSummary  # noqa: F401
from app.models.message_relation import MessageRelation  # noqa: F401
