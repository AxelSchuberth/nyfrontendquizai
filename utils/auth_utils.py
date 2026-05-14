def is_password_hash(stored_password):
    if not stored_password:
        return False

    return (
        stored_password.startswith("scrypt:")
        or stored_password.startswith("pbkdf2:")
        or stored_password.startswith("argon2:")
    )
