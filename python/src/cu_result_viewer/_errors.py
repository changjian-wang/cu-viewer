# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

"""Public error categories shared by the Viewer launcher."""


class ViewerError(Exception):
    """The installed Viewer cannot prepare or serve a session."""


class ViewerInputError(ViewerError):
    """The supplied local source or saved result is invalid."""
