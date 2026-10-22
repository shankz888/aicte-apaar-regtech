"""Mock APAAR Service Adapter.

Provides format and Verhoeff checksum verification for 12-digit APAAR IDs,
and utilities to generate valid mock IDs.
"""

from typing import Tuple

# Dihedral group D5 multiplication table
_D_TABLE = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]

# Permutation table
_P_TABLE = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

# Inversion table
_INV_TABLE = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]


def validate_verhoeff(num: str) -> bool:
    """Validate a numeric string using the Verhoeff algorithm."""
    if not num or not num.isdigit():
        return False
    c = 0
    for i, digit in enumerate(reversed(num)):
        c = _D_TABLE[c][_P_TABLE[i % 8][int(digit)]]
    return c == 0


def compute_verhoeff_check_digit(num: str) -> str:
    """Compute the Verhoeff check digit for a numeric string."""
    c = 0
    for i, digit in enumerate(reversed(num)):
        c = _D_TABLE[c][_P_TABLE[(i + 1) % 8][int(digit)]]
    return str(_INV_TABLE[c])


class MockApaarServiceAdapter:
    """Mock adapter for external APAAR verification registry."""

    def __init__(self) -> None:
        # Set of specific IDs configured to fail for testing purposes
        self.blocked_apaar_ids: set[str] = set()

    def block_id(self, apaar_id: str) -> None:
        """Mark an APAAR ID to intentionally fail verification."""
        self.blocked_apaar_ids.add(apaar_id.strip())

    def unblock_id(self, apaar_id: str) -> None:
        """Remove an APAAR ID from the blocked set."""
        self.blocked_apaar_ids.discard(apaar_id.strip())

    def validate_apaar(self, apaar_id: str) -> Tuple[bool, str | None]:
        """Validate APAAR ID format and checksum.

        Returns (True, None) on success.
        Returns (False, error_reason) on failure.
        """
        if not apaar_id or not isinstance(apaar_id, str):
            return False, "missing_or_empty"

        cleaned = apaar_id.strip()

        if cleaned in self.blocked_apaar_ids:
            return False, "mock_registry_blocked"

        if len(cleaned) != 12 or not cleaned.isdigit():
            return False, "invalid_format_must_be_12_digits"

        if not validate_verhoeff(cleaned):
            return False, "checksum_failed"

        return True, None

    @staticmethod
    def generate_valid_apaar_id(seed: int | str = 10000000001) -> str:
        """Generate a valid 12-digit APAAR ID with a correct Verhoeff check digit."""
        base_11 = str(seed).zfill(11)[:11]
        check_digit = compute_verhoeff_check_digit(base_11)
        return base_11 + check_digit


# Default singleton instance
apaar_adapter = MockApaarServiceAdapter()
