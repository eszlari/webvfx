// Copyright (c) 2010 Hewlett-Packard Development Company, L.P. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include <string>
#include <webvfx/webvfx.h>
extern "C" {
    #include <mlt/framework/mlt_log.h>
}
#include "service_locker.h"


namespace MLTWebVFX
{
const char* ServiceManager::kManagerPropertyName = "WebVFXManager";


ServiceLocker::ServiceLocker(mlt_service service)
    : service(service)
{
    mlt_service_lock(service);
}

ServiceLocker::~ServiceLocker()
{
    mlt_service_unlock(service);
}

bool ServiceLocker::initialize(int width, int height)
{
    mlt_properties properties = MLT_SERVICE_PROPERTIES(service);
    manager = (ServiceManager*)mlt_properties_get_data(properties, ServiceManager::kManagerPropertyName, 0);
    if (!manager) {
        manager = new ServiceManager(service);
        bool result = manager->initialize(width, height);
        if (!result) {
            destroyManager();
            mlt_log(service, MLT_LOG_ERROR, "Failed to create WebVFX ServiceManager\n");
            return result;
        }

        mlt_properties_set_data(properties, ServiceManager::kManagerPropertyName, manager, 0, (mlt_destructor)destroyManager, NULL);
    }
    return true;
}

ServiceManager* ServiceLocker::getManager()
{
    return manager;
}

void ServiceManager::destroyManager(ServiceManager* manager)
{
    delete manager; manager = 0
}

}