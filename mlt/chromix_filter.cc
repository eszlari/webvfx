// Copyright (c) 2010 Hewlett-Packard Development Company, L.P. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

extern "C" {
    #include <mlt/framework/mlt_filter.h>
    #include <mlt/framework/mlt_frame.h>
}
#include "chromix_task.h"


class ChromixFilterTask : public ChromixTask {
public:

    static int filterGetImage(mlt_frame frame, uint8_t **image, mlt_image_format *format, int *width, int *height, int writable) {
        int error = 0;

        // Get the filter
        mlt_filter filter = (mlt_filter)mlt_frame_pop_service(frame);

        // Compute time
        mlt_position in = mlt_filter_get_in(filter);
        mlt_position length = mlt_filter_get_out(filter) - in + 1;
        char *name = mlt_properties_get(MLT_FILTER_PROPERTIES(filter), "_unique_id");
        mlt_position position = mlt_properties_get_position(MLT_FRAME_PROPERTIES(frame), name);
        double time = (double)(position - in) / (double)length;

        // Get the image, we will write our output to it
        *format = mlt_image_rgb24a;
        if ((error = mlt_frame_get_image(frame, image, format, width, height, 1)) != 0)
            return error;

        { // Scope the ServiceLock
            mlt_service service = MLT_FILTER_SERVICE(filter);
            ServiceLock lock(service);

            ChromixFilterTask *task = (ChromixFilterTask*)getTask(service);
            if (!task)
                task = new ChromixFilterTask(service);

            ChromixRawImage targetImage(*image, *width, *height);
            task->filterImage.set(*image, *width, *height);
            error = task->renderToImageForTime(targetImage, time);
            task->filterImage.set();
        }

        return error;
    }

protected:
    ChromixFilterTask(mlt_service service) : ChromixTask(service) {}

    int performTask() {
        //XXX lookup param - map track to WTF::String
        //XXX lookup track property to get the WTF::String mixrender name for the image
        //XXX need a map of name to ChromixRawImage - maintain in ChromixTask, clear after each render
        return setImageForName(filterImage, "video");
    };

private:
    ChromixRawImage filterImage;
};


mlt_frame chromix_filter_process(mlt_filter filter, mlt_frame frame) {
    // Store position on frame
    char *name = mlt_properties_get(MLT_FILTER_PROPERTIES(filter), "_unique_id");
    mlt_properties_set_position(MLT_FRAME_PROPERTIES(frame), name, mlt_frame_get_position(frame));
    // Push the frame filter
    mlt_frame_push_service(frame, filter);
    mlt_frame_push_get_image(frame, ChromixFilterTask::filterGetImage);

    return frame;
}