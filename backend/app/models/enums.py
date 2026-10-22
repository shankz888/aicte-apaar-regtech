from enum import Enum


class InstitutionStatus(str, Enum):
    active = "active"
    probation = "probation"
    suspended = "suspended"


class IntakeStatus(str, Enum):
    active = "active"
    frozen = "frozen"


class ApaarStatus(str, Enum):
    verified = "verified"
    pending_apaar = "pending_apaar"
    failed_verification = "failed_verification"
    unavailable = "unavailable"


class Gender(str, Enum):
    male = "male"
    female = "female"
    transgender = "transgender"
    prefer_not_to_say = "prefer_not_to_say"


class AdmissionCategory(str, Enum):
    general = "general"
    ews = "ews"
    sc_st_obc = "sc_st_obc"
    nri = "nri"
    foreign_national = "foreign_national"
    lateral_entry = "lateral_entry"


class EnrolmentStatus(str, Enum):
    active = "active"
    transferred = "transferred"
    withdrawn = "withdrawn"
    graduated = "graduated"
    cancelled = "cancelled"


class BatchStatus(str, Enum):
    queued = "queued"
    parsing = "parsing"
    validating = "validating"
    completed = "completed"
    failed = "failed"


class ValidationSeverity(str, Enum):
    blocking = "blocking"
    warning = "warning"
    info = "info"


class ValidationStatus(str, Enum):
    accepted = "accepted"
    flagged = "flagged"
    rejected = "rejected"
