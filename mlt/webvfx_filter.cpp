// Copyright (c) 2010 Hewlett-Packard Development Company, L.P. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

extern "C" {
    #include <mlt/framework/mlt_filter.h>
    #include <mlt/framework/mlt_frame.h>
    #include <mlt/framework/mlt_log.h>
}
#include "webvfx_service.h"
#include "service_locker.h"


static int filterGetImage(mlt_frame frame, uint8_t **image, mlt_image_format *format, int *width, int *height, int writable) {
    int error = 0;

    // Get the filter
    mlt_filter filter = (mlt_filter)mlt_frame_pop_service(frame);

    // Compute time
    char *name = mlt_properties_get(MLT_FILTER_PROPERTIES(filter), "_unique_id");
    mlt_position position = mlt_properties_get_position(MLT_FRAME_PROPERTIES(frame), name);

    // Get the image, we will write our output to it
    *format = mlt_image_rgb24;
    if ((error = mlt_frame_get_image(frame, image, format, width, height, 1)) != 0)
        return error;

    { // Scope the lock
        MLTWebVFX::ServiceLocker locker(MLT_FILTER_SERVICE(filter));
        if (!locker.initialize(*width, *height))
            return 1;
        //XXX fix this
        ChromixRawImage targetImage(*image, *width, *height);
        task->aTrackImage.set(*image, *width, *height);
        error = task->renderToImageForPosition(targetImage, position);
        task->aTrackImage.set();
    }

    return error;
}

static mlt_frame filterProcess(mlt_filter filter, mlt_frame frame) {
    // Store position on frame
    char *name = mlt_properties_get(MLT_FILTER_PROPERTIES(filter), "_unique_id");
    mlt_properties_set_position(MLT_FRAME_PROPERTIES(frame), name, mlt_frame_get_position(frame));
    // Push the frame filter
    mlt_frame_push_service(frame, filter);
    mlt_frame_push_get_image(frame, filterGetImage);

    return frame;
}

mlt_service MLTWebVFX::createFilter(const char* serviceName) {
    mlt_filter self = mlt_filter_new();
    if (self) {
        self->process = filterProcess;
        return MLT_FILTER_SERVICE(self);
    }
    return 0;
}