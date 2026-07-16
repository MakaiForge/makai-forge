def register_handlers(register):

    @register("gpu_info")
    def handle_gpu_info(params: dict):
        from makai_time.core.gpu import info
        return info()

    @register("sync_info")
    def handle_sync_info(params: dict):
        from makai_time.core.sync import info
        return info()
